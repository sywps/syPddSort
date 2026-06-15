import argparse
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REBUILD_SCRIPT = ROOT / "temp" / "rebuild_cocos_competitor_palettes.py"


def load_rebuild_module():
    spec = importlib.util.spec_from_file_location("rebuild_cocos_competitor_palettes", REBUILD_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def resolve_native_asset(bundle_config_json, server_base, bundle_name, texture_uuid, download_dir):
    rebuild = load_rebuild_module()
    bundle_config = json.loads(Path(bundle_config_json).read_text(encoding="utf-8"))
    base_uuid, decoded_uuid, native_version, version_hint, stems = rebuild.build_native_stems(texture_uuid, bundle_config)
    image, local_path, resolved_url = rebuild.download_texture(
        server_base,
        bundle_name,
        texture_uuid,
        bundle_config,
        download_dir,
    )
    return {
        "textureUuid": texture_uuid,
        "compressedUuid": base_uuid,
        "decodedUuid": decoded_uuid,
        "nativeVersion": native_version,
        "versionHint": version_hint,
        "candidateStems": stems,
        "resolvedUrl": resolved_url,
        "localPath": str(local_path),
        "imageSize": {
            "width": image.size[0],
            "height": image.size[1],
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Resolve and optionally download a Cocos remote native asset.")
    parser.add_argument("--bundle-config-json", required=True)
    parser.add_argument("--server-base", required=True)
    parser.add_argument("--bundle-name", required=True)
    parser.add_argument("--texture-uuid", required=True)
    parser.add_argument("--download-dir", required=True)
    parser.add_argument("--output-json")
    args = parser.parse_args()

    result = resolve_native_asset(
        args.bundle_config_json,
        args.server_base,
        args.bundle_name,
        args.texture_uuid,
        args.download_dir,
    )

    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output_json:
        target = Path(args.output_json)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(output, encoding="utf-8")
    else:
        print(output, end="")


if __name__ == "__main__":
    main()
