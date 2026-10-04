# blender -b -P scripts/lightmap/bake.py -- <scene.glb> <meta.json> <out dir> <bases> <main size> <main spp> <sun size> <sun spp>
# bases, comma separated: sky (uniform white sky, all light) | lamp (the lamps, all light) | sun:<hours> (unit sun,
# bounced light only). Bakes Cycles diffuse lighting (no albedo) into the receivers' lightmap atlas: E/pi, so 1.0 on
# an open floor under a sky of radiance 1. Writes <basis>.exr plus, per size, the denoiser's guides (normal, chart id).
# Light probes for everything that has no lightmap: a grid over the house, each probe six 1 cm faces turned along the
# axes, each face baked into its own 4x4 texel cell; probes_<basis>.f32 holds [probe][face +x -x +y -y +z -z][rgb] in
# the page's axes (y up), probes.json the grid and which probes sit inside solid geometry.
import bpy, json, sys, math, os, time
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
glb, meta_path, out_dir, bases = argv[0], argv[1], argv[2], argv[3].split(',')
main_size, main_spp, sun_size, sun_spp = int(argv[4]), int(argv[5]), int(argv[6]), int(argv[7])
meta = json.load(open(meta_path))
os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices: d.use = d.type != 'CPU'
scene.cycles.device = 'GPU'
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 8
scene.cycles.diffuse_bounces = 5
scene.cycles.transmission_bounces = 4
scene.cycles.transparent_max_bounces = 8
scene.cycles.glossy_bounces = 0
scene.cycles.sample_clamp_indirect = 3.0

recv = {r['name']: r for r in meta['receivers']}
occ = {o['name']: o for o in meta['occluders']}

def node_mat(name, rgb, paper=0.0, leaf=False, vcol=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    dif = nt.nodes.new('ShaderNodeBsdfDiffuse')
    dif.inputs['Color'].default_value = (*rgb, 1)
    if vcol:
        a = nt.nodes.new('ShaderNodeVertexColor')
        nt.links.new(a.outputs['Color'], dif.inputs['Color'])
    sh = dif.outputs['BSDF']
    if paper > 0:
        tr = nt.nodes.new('ShaderNodeBsdfTranslucent')
        tr.inputs['Color'].default_value = (*rgb, 1)
        mix = nt.nodes.new('ShaderNodeMixShader')
        mix.inputs['Fac'].default_value = paper
        nt.links.new(sh, mix.inputs[1]); nt.links.new(tr.outputs['BSDF'], mix.inputs[2])
        sh = mix.outputs['Shader']
    if leaf:
        tp = nt.nodes.new('ShaderNodeBsdfTransparent')
        tr = nt.nodes.new('ShaderNodeBsdfTranslucent')
        tr.inputs['Color'].default_value = (0.08, 0.12, 0.03, 1)
        m1 = nt.nodes.new('ShaderNodeMixShader'); m1.inputs['Fac'].default_value = 0.35
        nt.links.new(sh, m1.inputs[1]); nt.links.new(tr.outputs['BSDF'], m1.inputs[2])
        m2 = nt.nodes.new('ShaderNodeMixShader'); m2.inputs['Fac'].default_value = 0.55
        nt.links.new(m1.outputs['Shader'], m2.inputs[1]); nt.links.new(tp.outputs['BSDF'], m2.inputs[2])
        sh = m2.outputs['Shader']
    nt.links.new(sh, out.inputs['Surface'])
    return m

receivers, light_mats, id_mats = [], {}, {}
for ob in scene.objects:
    if ob.type != 'MESH': continue
    nm = ob.name.split('.')[0]
    if nm in recv:
        r = recv[nm]
        light_mats[ob.name] = node_mat(nm, r['albedo'], paper=r.get('paper', 0))
        id_mats[ob.name] = node_mat(nm + '_id', (1, 1, 1), vcol=True)
        m = light_mats[ob.name]
        receivers.append(ob)
    elif nm == 'G_ground':
        m = node_mat(nm, (1, 1, 1), vcol=True)
    elif nm in occ:
        o = occ[nm]
        m = node_mat(nm, o['albedo'], paper=0.6 if 'lampPaper' in nm else 0.0, leaf=o['leaf'])
    else:
        m = node_mat(nm, (0.3, 0.3, 0.3))
    ob.data.materials.clear()
    ob.data.materials.append(m)
    ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons))

def target(mats, img):
    for ob in receivers:
        m = mats[ob.name]
        ob.data.materials[0] = m
        t = m.node_tree.nodes.get('lm') or m.node_tree.nodes.new('ShaderNodeTexImage')
        t.name = 'lm'
        t.image = img
        m.node_tree.nodes.active = t

def new_img(name, size):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    return img

def save(img, name):
    img.filepath_raw = os.path.join(out_dir, name + '.exr')
    img.file_format = 'OPEN_EXR'
    img.save()

# ---- probes, laid out in the page's axes; Blender's are (x, -z, y)
PR_MIN, PR_STEP, PR_N = (-23.6, 0.25, -9.0), 0.4, (103, 9, 30)
PR_CELL, PR_IMG = 4, 2048
bl = lambda x, y, z: Vector((x, -z, y))
probes = [(PR_MIN[0] + i * PR_STEP, PR_MIN[1] + j * PR_STEP, PR_MIN[2] + k * PR_STEP)
          for k in range(PR_N[2]) for j in range(PR_N[1]) for i in range(PR_N[0])]
# a probe inside a wall, post or floor sees the backs of faces in most directions
verts, polys = [], []
for ob in scene.objects:
    if ob.type != 'MESH': continue
    nm = ob.name.split('.')[0]
    if not (nm in recv or nm.startswith('O_h_') or nm == 'O_roof'): continue
    mw = ob.matrix_world
    base = len(verts)
    verts.extend(mw @ v.co for v in ob.data.vertices)
    polys.extend(tuple(base + i for i in p.vertices) for p in ob.data.polygons)
bvh = BVHTree.FromPolygons(verts, polys)
dirs = [Vector(d).normalized() for d in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1),
        (1,1,1),(1,1,-1),(1,-1,1),(1,-1,-1),(-1,1,1),(-1,1,-1),(-1,-1,1),(-1,-1,-1)]]
valid = []
for p in probes:
    o = bl(*p)
    back = 0
    for d in dirs:
        loc, nrm, idx, dist = bvh.ray_cast(o, d, 3.0)
        if loc is not None and nrm.dot(d) > 0: back += 1
    valid.append(1 if back < 4 else 0)
print('[lm] probes', len(probes), 'valid', sum(valid), flush=True)
faces_dir = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
pv, pf, puv = [], [], []
cells = PR_IMG // PR_CELL
for pi, p in enumerate(probes):
    c = bl(*p)
    for fi, d in enumerate(faces_dir):
        n = bl(*d)
        t1 = n.orthogonal().normalized()
        t2 = n.cross(t1)
        ctr = c + n * 0.006
        b = len(pv)
        pv.extend([ctr - t1 * 0.005 - t2 * 0.005, ctr + t1 * 0.005 - t2 * 0.005, ctr + t1 * 0.005 + t2 * 0.005, ctr - t1 * 0.005 + t2 * 0.005])
        pf.append((b, b + 1, b + 2, b + 3))
        cell = pi * 6 + fi
        u0, v0 = (cell % cells) * PR_CELL / PR_IMG, (cell // cells) * PR_CELL / PR_IMG
        u1, v1 = u0 + PR_CELL / PR_IMG, v0 + PR_CELL / PR_IMG
        puv.extend([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
pm = bpy.data.meshes.new('probes')
pm.from_pydata(pv, [], pf)
uvl = pm.uv_layers.new(name='uv')
uvl.data.foreach_set('uv', [x for uv in puv for x in uv])
probe_ob = bpy.data.objects.new('probes', pm)
scene.collection.objects.link(probe_ob)
for a in ('visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_shadow', 'visible_volume_scatter'):
    setattr(probe_ob, a, False)
probe_mat = node_mat('probe', (0.5, 0.5, 0.5))
pm.materials.append(probe_mat)
json.dump({'min': PR_MIN, 'step': PR_STEP, 'n': PR_N, 'valid': valid}, open(os.path.join(out_dir, 'probes.json'), 'w'))

def probe_target(img):
    t = probe_mat.node_tree.nodes.get('lm') or probe_mat.node_tree.nodes.new('ShaderNodeTexImage')
    t.name = 'lm'
    t.image = img
    probe_mat.node_tree.nodes.active = t

def probe_read(img, name):
    px = np.empty(PR_IMG * PR_IMG * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(PR_IMG // PR_CELL, PR_CELL, PR_IMG // PR_CELL, PR_CELL, 4)[..., :3].mean(axis=(1, 3)).reshape(-1, 3)
    px[:len(probes) * 6].astype(np.float32).tofile(os.path.join(out_dir, f'probes_{name}.f32'))

bpy.ops.object.select_all(action='DESELECT')
for ob in receivers: ob.select_set(True)
bpy.context.view_layer.objects.active = receivers[0]

def bake(kind, filt, spp, **kw):
    scene.cycles.samples = spp
    t0 = time.time()
    bpy.ops.object.bake(type=kind, pass_filter=filt, margin=2, margin_type='EXTEND', use_clear=True, **kw)
    return time.time() - t0

# guides for the denoiser, once per size
for size in sorted({main_size, sun_size}):
    img = new_img(f'nrm{size}', size)
    target(light_mats, img)
    bake('NORMAL', set(), 1, normal_space='OBJECT')
    save(img, f'guide_nrm_{size}')
    img = new_img(f'id{size}', size)
    target(id_mats, img)
    bake('DIFFUSE', {'COLOR'}, 1)
    save(img, f'guide_id_{size}')
print('[lm] guides done', flush=True)

world = bpy.data.worlds.new('w')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Strength'].default_value = 1.0
lights = []

for basis in bases:
    for ob in lights: bpy.data.objects.remove(ob, do_unlink=True)
    lights.clear()
    filt = {'DIRECT', 'INDIRECT'}
    size, spp = main_size, main_spp
    if basis == 'sky':
        bg.inputs['Color'].default_value = (1, 1, 1, 1)
    elif basis.startswith('sun:'):
        bg.inputs['Color'].default_value = (0, 0, 0, 1)
        h = float(basis[4:])
        s = min(meta['suns'], key=lambda e: abs(e[0] - h))
        # glTF y-up (x, y, z) -> Blender z-up (x, -z, y); the light shines away from the sun
        d = Vector((s[1], -s[3], s[2]))
        lt = bpy.data.lights.new('sun', 'SUN')
        lt.energy = 1.0
        lt.angle = math.radians(0.53)
        ob = bpy.data.objects.new('sun', lt)
        scene.collection.objects.link(ob)
        ob.rotation_mode = 'QUATERNION'
        ob.rotation_quaternion = (-d).to_track_quat('-Z', 'Y')
        lights.append(ob)
        filt = {'INDIRECT'}
        size, spp = sun_size, sun_spp
    elif basis == 'lamp':
        bg.inputs['Color'].default_value = (0, 0, 0, 1)
        for i, l in enumerate(meta['lamps']):
            lt = bpy.data.lights.new(f'lamp{i}', 'POINT')
            lt.color = l['c']
            # the page's lamp gives E = col * i * 2.2 / (1 + d^2/r^2); match it at d = r: P = 4 pi r^2 E
            lt.energy = 4 * math.pi * l['r'] ** 2 * l['i'] * 2.2 * 0.5
            lt.shadow_soft_size = 0.08
            ob = bpy.data.objects.new(f'lamp{i}', lt)
            p = l['p']
            ob.location = (p[0], -p[2], p[1])
            scene.collection.objects.link(ob)
            lights.append(ob)
    img = new_img(basis, size)
    target(light_mats, img)
    pimg = new_img('p_' + basis, PR_IMG)
    probe_target(pimg)
    probe_ob.select_set(True)
    dt = bake('DIFFUSE', filt, spp)
    probe_ob.select_set(False)
    name = basis.replace(':', '_')
    save(img, name)
    probe_read(pimg, name)
    print(f'[lm] {name} {size}px {spp}spp {dt:.0f}s', flush=True)
