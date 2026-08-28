"""BlenderのArmature ActionをFightingGame2D用2D骨格JSONへ書き出す。

Blenderからの実行例:
  blender --background Fighter.blend --python tools/blender_export_fighting_animation.py -- \
    --armature Armature --output public/data/animations/my_fighter.json

ゲームではBlenderワールドのX軸を横方向、Z軸を縦方向として扱う。Action名は
idle、walk、jump、light、heavy、special、hit、block、koを推奨する（別名の場合は
moves.csvのanimation列を合わせる）。ブラウザは.blendを直接再生できないため、
このスクリプトで決定論的なフレームサンプル済み実行用データに変換する。
"""

import argparse
import json
import math
import sys

import bpy


def parse_arguments():
    """Blenderの`--`以降で渡されたArmature名と出力先を読む。"""
    arguments = sys.argv
    arguments = arguments[arguments.index("--") + 1 :] if "--" in arguments else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--armature", required=True, help="Armature object name")
    parser.add_argument("--output", required=True, help="JSON output path")
    parser.add_argument("--line-width", type=float, default=9.0)
    return parser.parse_args(arguments)


def point(vector, root):
    """Blenderのワールド座標を、下方向が正のローカル画面ピクセルへ変換する。"""
    return [round((vector.x - root.x) * 100, 3), round(-(vector.z - root.z) * 100, 3)]


def action_frames(scene, armature, action, line_width):
    """1つのActionをフレームごとの骨線分配列としてサンプリングする。"""
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
    """全ActionをJSONへまとめ、ブラウザ側の骨格アニメーション再生用に保存する。"""
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
