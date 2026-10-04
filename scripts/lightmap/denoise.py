# blender -b -P scripts/lightmap/denoise.py -- <noisy.exr> <guide_nrm.exr> <guide_id.exr> <out.f32>
# OIDN through the compositor. The chart-id image stands in for albedo, so the filter keeps every chart's light to
# itself; the normals keep creases. Writes raw float32 RGB as Blender holds it: rows bottom-up, and the glTF import
# has already turned v into 1 - v, so the last row is v = 0.
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
src, nrm, cid, out = argv
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
img = bpy.data.images.load(src)
W, H = img.size
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
tree = bpy.data.node_groups.new('comp', 'CompositorNodeTree')
sc.compositing_node_group = tree
tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
i = tree.nodes.new('CompositorNodeImage'); i.image = img
n = tree.nodes.new('CompositorNodeImage'); n.image = bpy.data.images.load(nrm)
a = tree.nodes.new('CompositorNodeImage'); a.image = bpy.data.images.load(cid)
# baked normals are stored 0..1; the denoiser wants -1..1
mul = tree.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY_ADD'
mul.inputs[1].default_value = (2, 2, 2); mul.inputs[2].default_value = (-1, -1, -1)
d = tree.nodes.new('CompositorNodeDenoise')
d.inputs['HDR'].default_value = True
try: d.inputs['Prefilter'].default_value = 'None'
except Exception as e: print('prefilter', e)
try: d.inputs['Quality'].default_value = 'High'
except Exception as e: print('quality', e)
o = tree.nodes.new('NodeGroupOutput')
tree.links.new(i.outputs['Image'], d.inputs['Image'])
tree.links.new(a.outputs['Image'], d.inputs['Albedo'])
tree.links.new(n.outputs['Image'], mul.inputs[0])
tree.links.new(mul.outputs[0], d.inputs['Normal'])
tree.links.new(d.outputs['Image'], o.inputs[0])
sc.render.image_settings.file_format = 'OPEN_EXR'
sc.render.image_settings.color_depth = '32'
sc.render.filepath = out + '.exr'
bpy.ops.render.render(write_still=True)
res = bpy.data.images.load(out + '.exr')
px = np.empty(W * H * 4, np.float32)
res.pixels.foreach_get(px)
px.reshape(-1, 4)[:, :3].astype(np.float32).tofile(out)
print('[dn] wrote', out, W, H)
