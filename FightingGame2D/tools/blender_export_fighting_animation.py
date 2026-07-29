"""Export Blender armature actions for FightingGame2D's 2D bone renderer.

Run from Blender, for example:
  blender --background Fighter.blend --python tools/blender_export_fighting_animation.py -- \
    --armature Armature --output public/data/animations/my_fighter.json

The game uses Blender's world X axis as horizontal and world Z as vertical.  Create
actions named idle, walk, jump, light, heavy, special, hit, block, and ko (or adjust
the move CSV to reference the action name).  A browser cannot play a .blend directly;
this script writes the deterministic, frame-sampled runtime representation instead.
"""

import argparse
import json
import math
import sys

import bpy


def parse_arguments():
    arguments = sys.argv
    arguments = arguments[arguments.index("--") + 1 :] if "--" in arguments else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--armature", required=True, help="Armature object name")
    parser.add_argument("--output", required=True, help="JSON output path")
    parser.add_argument("--line-width", type=float, default=9.0)
    return parser.parse_args(arguments)


def point(vector, root):
    """Convert Blender world units to local screen pixels (Y points down in Canvas)."""
    return [round((vector.x - root.x) * 100, 3), round(-(vector.z - root.z) * 100, 3)]


def action_frames(scene, armature, action, line_width):
    if armature.animation_data is None:
        armature.animation_data_create()
    armature.animation_data.action = action
    frame_start = math.ceil(action.frame_range[0])
    frame_end = math.floor(action.frame_range[1])
    bone_names = sorted(armature.pose.bones.keys())
    root_bone = armature.pose.bones[0]
    output = []

    for frame in range(frame_start, frame_end + 1):
        scene.frame_set(frame)
        root = armature.matrix_world @ root_bone.head
        segments = []
        for name in bone_names:
            pose_bone = armature.pose.bones[name]
            head = armature.matrix_world @ pose_bone.head
            tail = armature.matrix_world @ pose_bone.tail
            x1, y1 = point(head, root)
            x2, y2 = point(tail, root)
            segments.append([x1, y1, x2, y2, line_width])
        output.append({"segments": segments})
    return output


def main():
    options = parse_arguments()
    scene = bpy.context.scene
    armature = bpy.data.objects.get(options.armature)
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError("--armature must name an ARMATURE object")

    animations = {}
    for action in sorted(bpy.data.actions, key=lambda item: item.name):
        animations[action.name] = action_frames(scene, armature, action, options.line_width)

    fps = round(scene.render.fps / scene.render.fps_base)
    payload = {
        "format": "fightinggame2d-blender-bones-v1",
        "fps": fps,
        "animations": animations,
    }
    with open(options.output, "w", encoding="utf-8") as output_file:
        json.dump(payload, output_file, ensure_ascii=False, separators=(",", ":"))
    print("Exported {} actions to {}".format(len(animations), options.output))


if __name__ == "__main__":
    main()
