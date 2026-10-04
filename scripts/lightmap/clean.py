# blender -b -P scripts/lightmap/clean.py -- <denoised.f32> <guide_nrm.exr> <guide_id.exr> <out.f32>
# Where a map's light is only a faint bounce (the lamp map away from the lamps), the bake's fireflies stand several
# stops above the true light and the denoiser leaves them as warm blotches. A texel there that stands well off its
# geometric mean over the same chart and facing (in which a firefly hardly counts), in any channel, is pulled to that
# mean; the rest, gradients and lit texels with their lamp shadows, are kept as they are.
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
src, nrm, cid, out = argv
bpy.ops.wm.read_factory_settings(use_empty=True)

def load(path):
    img = bpy.data.images.load(path)
    W, H = img.size
    px = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(H, W, 4)[..., :3]

N = load(nrm) * 2.0 - 1.0
ID = load(cid)
H, W = ID.shape[:2]
L = np.fromfile(src, np.float32).reshape(H, W, 3)
valid = ID.max(axis=2) > 0
EPS = 2.0 ** -14
lL = np.log2(np.maximum(L, 0.0) + EPS)

R, SIG = 6, 3.0
acc = np.zeros_like(lL)
wsum = np.zeros((H, W), np.float32)
for dy in range(-R, R + 1):
    for dx in range(-R, R + 1):
        r2 = dx * dx + dy * dy
        if r2 > R * R:
            continue
        ys, yd = (slice(dy, H), slice(0, H - dy)) if dy >= 0 else (slice(0, H + dy), slice(-dy, H))
        xs, xd = (slice(dx, W), slice(0, W - dx)) if dx >= 0 else (slice(0, W + dx), slice(-dx, W))
        same = np.all(np.abs(ID[ys, xs] - ID[yd, xd]) < 1e-3, axis=2) & valid[ys, xs]
        nd = np.sum(N[ys, xs] * N[yd, xd], axis=2)
        w = np.float32(np.exp(-r2 / (2 * SIG * SIG))) * same * np.clip((nd - 0.8) / 0.15, 0.0, 1.0)
        acc[yd, xd] += lL[ys, xs] * w[..., None]
        wsum[yd, xd] += w
    print('[cl] row', dy, flush=True)

mean = np.where(wsum[..., None] > 0, acc / np.maximum(wsum, 1e-6)[..., None], lL)
Y = mean @ np.array([0.2126, 0.7152, 0.0722], np.float32)
ss = lambda x: (lambda t: t * t * (3 - 2 * t))(np.clip(x, 0.0, 1.0))
# faint: below about 1/32 of the sky's open-floor light fully, nothing above about 1/4; off: more than 0.75 to 2 stops
faint = ss((-2.0 - Y) / 3.0)
off = ss((np.abs(lL - mean).max(axis=2) - 0.75) / 1.25)
k = (faint * off)[..., None]
res = np.where(valid[..., None], np.exp2(lL * (1 - k) + mean * k) - EPS, L)
np.maximum(res, 0.0).astype(np.float32).tofile(out)
print('[cl] wrote', out, W, H, 'replaced', float((k[..., 0] > 0.5)[valid].mean()), flush=True)
