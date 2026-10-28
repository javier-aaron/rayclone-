"""Generate the Rayclone app icon (rounded square + bolt) as .ico and .png."""
from PIL import Image, ImageDraw
import os

OUT = os.path.dirname(os.path.abspath(__file__))
S = 1024
SS = 4  # supersample for smooth edges

img = Image.new("RGBA", (S * SS, S * SS), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# rounded square in Raycast's brand red
radius = int(230 * SS)
d.rounded_rectangle([0, 0, S * SS - 1, S * SS - 1], radius=radius, fill=(255, 99, 99, 255))

# lightning bolt
bolt = [(600, 150), (320, 570), (497, 570), (424, 874), (704, 430), (523, 430)]
d.polygon([(x * SS, y * SS) for x, y in bolt], fill=(255, 255, 255, 255))

img = img.resize((S, S), Image.LANCZOS)

img.save(os.path.join(OUT, "icon.png"))
img.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-512.png"))
img.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "icon-256.png"))
img.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, "tray.png"))

img.save(
    os.path.join(OUT, "icon.ico"),
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)

print("wrote icon.ico, icon.png, icon-256.png, icon-512.png, tray.png")
