#!/usr/bin/env python3
"""
壁纸体检脚本 —— 换壁纸后跑一下，直接告诉你图片有没有问题。

用法（在项目根目录，也就是有 package.json 的那一层）：

    python3 check-wallpaper.py                  # 检查 public/ 下那两张
    python3 check-wallpaper.py 图片A.jpg 图片B.jpg   # 检查指定的图（路径随便给）

需要先装一次依赖（只装这一次）：

    pip install pillow

它会逐项告诉你：
  - 文件在不在、能不能被程序打开
  - 实际是什么格式（扩展名可能骗人）
  - 色彩模式对不对（CMYK 有些浏览器画不出来）
  - 尺寸是不是够做 4K 壁纸
  - 体积是不是太大了
  - 是不是损坏的（截断的文件很常见）

最后给出结论和修复命令。

⚠️ 最推荐的用法：把你【准备替换的那张图】和【现在项目里能正常显示的那张图】
   一起传进来对比。这样一眼就能看出差别在哪：

       python3 check-wallpaper.py D:/我的4K图.jpg public/wallpaper.jpg
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("❌ 缺少依赖，请先运行：pip install pillow")
    sys.exit(1)

# 浏览器能可靠解码的 JPEG 色彩模式。
# CMYK 在 Chrome 里通常没问题，但部分浏览器（尤其 Safari 的某些版本）
# 和部分系统色彩配置下会画不出来 —— 所以标成警告而不是错误。
OK_MODES = {"RGB", "L"}
WARN_MODES = {"CMYK", "RGBA", "P", "LA"}

MIN_W, MIN_H = 1920, 1080          # 低于这个尺寸做壁纸会糊
WARN_BYTES = 3 * 1024 * 1024       # 超过 3MB 就提醒一下
MAX_BYTES = 8 * 1024 * 1024        # 超过 8MB 建议压缩

TARGETS = ["wallpaper.jpg", "wallpaper-dark.jpg"]
PUBLIC = Path("public")


def human(n: int) -> str:
    return f"{n / 1024 / 1024:.2f} MB" if n >= 1024 * 1024 else f"{n / 1024:.1f} KB"


def check(path: Path) -> bool:
    """检查一张图，返回 True 表示没问题"""
    print(f"\n{'=' * 60}")
    print(f"检查：{path}")
    print("=" * 60)

    if not path.exists():
        print(f"❌ 文件不存在")
        print(f"   → 壁纸层会画不出任何东西，桌面会是纯白/纯色")
        print(f"   → 请确认文件放在 {PUBLIC}/ 目录下，且文件名完全一致")
        print(f"     （注意 Windows 可能偷偷加了 .jpg.txt 这样的后缀）")
        return False

    size = path.stat().st_size
    print(f"  文件大小：{human(size)}（{size} 字节）")

    if size == 0:
        print(f"❌ 文件是空的（0 字节）")
        print(f"   → 多半是复制过程中断了，重新复制一次")
        return False

    # 读文件头，判断真实格式（不看扩展名）
    with open(path, "rb") as f:
        head = f.read(16)

    sig = {
        b"\xff\xd8\xff": "JPEG",
        b"\x89PNG\r\n\x1a\n": "PNG",
        b"RIFF": "WEBP/其它 RIFF",
        b"GIF8": "GIF",
        b"BM": "BMP",
        b"II*\x00": "TIFF",
        b"MM\x00*": "TIFF",
    }
    actual = next((v for k, v in sig.items() if head.startswith(k)), None)

    if actual is None:
        # 看看是不是被人误存成了文本
        try:
            text = path.read_bytes()[:200].decode("utf-8")
            looks_text = all(c.isprintable() or c in "\r\n\t" for c in text)
        except Exception:
            looks_text = False

        if looks_text:
            print("❌ 这不是图片，而是一个文本文件！")
            print("   → 最常见的原因：用编辑器另存为时把 .jpg 打成了 .txt，")
            print("     或者从网页上复制时复制到的是图片链接而不是图片本身")
        else:
            print("❌ 文件头无法识别，不是浏览器支持的图片格式")
            print(f"   实际开头字节：{head[:8].hex(' ')}")
        return False

    print(f"  真实格式：{actual}", end="")
    if actual not in ("JPEG", "PNG"):
        print("  ❌ 浏览器不保证支持")
        print("   → 请转成 JPEG 或 PNG")
        return False
    if path.suffix.lower() == ".jpg" and actual != "JPEG":
        print(f"  ⚠️  扩展名是 .jpg 但实际是 {actual}（一般能显示，但建议统一）")
    elif path.suffix.lower() == ".png" and actual != "PNG":
        print(f"  ⚠️  扩展名是 .png 但实际是 {actual}")
    else:
        print("  ✅")

    # 尝试真正解码。这一步能发现截断/损坏的文件
    try:
        im = Image.open(path)
        im.load()  # 必须 load 才会真的解码全部像素
    except Exception as e:
        print(f"❌ 无法解码：{type(e).__name__}: {e}")
        print(f"   → 文件多半是损坏或下载不完整的")
        print(f"   → 解决办法：重新导出/下载一次这张图")
        return False

    w, h = im.size
    print(f"  尺寸：{w} × {h}", end="")

    if w < MIN_W or h < MIN_H:
        print(f"  ⚠️  小于 1920×1080，做壁纸会模糊")
    elif w >= 3840 and h >= 2160:
        print(f"  ✅ 达到 4K")
    else:
        print(f"  ✅ 够用")

    print(f"  色彩模式：{im.mode}", end="")
    if im.mode in OK_MODES:
        print(f"  ✅")
    elif im.mode in WARN_MODES:
        print(f"  ⚠️  建议转成 RGB")
        if im.mode == "CMYK":
            print(f"     CMYK 是印刷用的色彩模式。多数浏览器能显示，")
            print(f"     但个别浏览器/系统色彩配置下会画不出来，表现就是白屏。")
            print(f"     做壁纸一律建议转成 RGB —— 反正屏幕本来就是 RGB。")
    else:
        print(f"  ⚠️  不常见，建议转成 RGB")

    # 体积
    if size >= MAX_BYTES:
        print(f"  体积：{human(size)}  ⚠️  偏大，建议压到 1MB 以内（加载会明显变慢）")
        need_compress = True
    elif size >= WARN_BYTES:
        print(f"  体积：{human(size)}  ⚠️  略大，可以再压一下")
        need_compress = True
    else:
        print(f"  体积：{human(size)}  ✅")
        need_compress = False

    # 找出需要修的项
    fixes = []
    if im.mode != "RGB":
        fixes.append("转 RGB")
    if need_compress:
        fixes.append("压缩体积")
    if w < MIN_W or h < MIN_H:
        fixes.append("换更大的图")

    if fixes:
        print(f"\n  📝 建议处理：{'、'.join(fixes)}")
        print(f"     用下面这段（把文件名换成你的）：\n")
        print(f"     from PIL import Image")
        print(f"     im = Image.open('{path}').convert('RGB')")
        print(f"     im.save('{path}', 'JPEG', quality=88, optimize=True, progressive=True)")
        return False

    print(f"\n  ✅ 这张图没问题，浏览器应该能正常显示")
    return True


def main() -> int:
    print("\n壁纸体检")
    print(f"当前目录：{Path.cwd()}")

    # 命令行给了路径就检查那些，否则检查 public 下约定好的两张。
    # 支持任意路径，方便把"我的图"和"项目里能用的图"放一起对比。
    if len(sys.argv) > 1:
        targets = [Path(a) for a in sys.argv[1:]]
        print(f"（按参数检查 {len(targets)} 个文件）")
    else:
        if not PUBLIC.is_dir():
            print(f"\n❌ 找不到 public 目录")
            print(f"   → 请确认你在【项目根目录】（有 package.json 的那一层）运行这个脚本")
            print(f"   → 或者直接把图片路径当参数传进来：")
            print(f"     python3 check-wallpaper.py D:/我的图.jpg")
            return 1
        targets = [PUBLIC / name for name in TARGETS]

    results = {str(p): check(p) for p in targets}

    print(f"\n{'=' * 60}")
    print("总结")
    print("=" * 60)

    all_ok = all(results.values())
    for name, ok in results.items():
        print(f"  {'✅' if ok else '❌'}  {name}")

    if all_ok:
        print("\n这些图都没问题。如果桌面还是白的，按顺序试这几步：")
        print("  1. 硬刷新浏览器：Ctrl + Shift + R（Mac 是 Cmd + Shift + R）")
        print("     浏览器会把图片缓存起来，换了文件但地址没变时最容易踩这个")
        print("  2. 重启 dev server：Ctrl + C 停掉，再 npm run dev")
        print("  3. F12 打开控制台看 Network 面板，找 wallpaper.jpg：")
        print("     状态 200 但内容为空 / 状态 304  → 是缓存问题，按第 1 步解决")
        print("     状态 404                        → 路径不对，看下面「路径」那一节")
        print("  4. 直接访问 http://localhost:4321/wallpaper.jpg 看能不能看到图")
        print("     看得到图 → 图片没问题，是页面/CSS 的问题")
        print("     看不到图 → 文件没被正确放到 public 下")
        print("  5. 确认文件【真的替换成功了】：在 public 目录下执行")
        print("     ls -la wallpaper.jpg         （Windows 用 dir wallpaper.jpg）")
        print("     看修改时间和字节数有没有变成新的")
    else:
        print("\n有问题的那张按上面的提示修一下就好。")

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
