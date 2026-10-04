// KTX2 from any image sharp can read.
// kind: 'c' colour (sRGB), 'n' GL normal (renormalised mips), 'r' linear data. flip: bake the vertical flip
// a TextureLoader would have applied, so the maps line up with the UVs they were authored for.
// codec: 'uastc' (RDO + Zstandard) where a surface is smooth enough to show block error: plaster, tatami, planed
// wood, glaze, and every normal map; 'etc1s' for busy natural colour (bark, stone, gravel, scans), where the
// texture's own grain hides ETC1S's error at a quarter of the size (pebbles 2K: 0.9 MB at 34.2 dB against
// UASTC's 3.75 MB at 35.3 dB).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const TMP = new URL('../.cache/ktx/tmp/', import.meta.url).pathname;
mkdirSync(TMP, { recursive: true });
let n = 0;

export async function ktx2(input, { kind = 'c', size, flip = false, alpha = false, lambda = 4, codec = kind === 'c' ? 'etc1s' : 'uastc' } = {}) {
  const png = join(TMP, `in_${process.pid}_${n}.png`), out = join(TMP, `out_${process.pid}_${n++}.ktx2`);
  let img = sharp(input, { limitInputPixels: false });
  if (size) img = img.resize(size, size, { fit: 'fill', kernel: 'lanczos3' });
  img = alpha ? img.ensureAlpha() : img.removeAlpha();
  await img.png({ compressionLevel: 1 }).toFile(png);
  const args = codec === 'etc1s' ? ['-ktx2', '-etc1s', '-quality', '100', '-mipmap'] : ['-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', String(lambda), '-mipmap', '-ktx2_zstandard_level', '18'];
  if (kind === 'c') args.push('-srgb', '-mip_srgb');
  else if (kind === 'n') args.push('-normal_map', '-mip_renorm');
  else args.push('-linear', '-mip_linear');
  if (flip) args.push('-y_flip');
  execFileSync('basisu', [...args, png, '-output_file', out], { stdio: 'ignore' });
  return readFileSync(out);
}

export async function ktx2File(input, dst, opts) {
  const b = await ktx2(input, opts);
  writeFileSync(dst, b);
  return b.length;
}
