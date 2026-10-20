from PIL import Image

src = r"C:\Users\SUDHAKAR\.cursor\projects\c-Users-SUDHAKAR-Downloads-Quantum-Visa-Manager\assets\c__Users_SUDHAKAR_AppData_Roaming_Cursor_User_workspaceStorage_4e30bc653075cfd927f793749065fd0f_images_Quantum-VIsa-Manager.1-db6d85f5-2a3d-4883-8d8d-c44d1a2e24fc.png"
logo_out = r"c:\Users\SUDHAKAR\Downloads\Quantum Visa Manager\public\assets\logo.png"
fav_out = r"c:\Users\SUDHAKAR\Downloads\Quantum Visa Manager\public\favicon.png"
fav_svg_dir = r"c:\Users\SUDHAKAR\Downloads\Quantum Visa Manager\public\assets\favicon.png"

bg = (8, 29, 56)
lo, hi = 88, 150

im = Image.open(src).convert("RGBA")
w, h = im.size
pix = im.load()

def dist(c):
    return ((c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2) ** 0.5

for y in range(h):
    for x in range(w):
        r, g, b, a = pix[x, y]
        d = dist((r, g, b))
        if d <= lo:
            pix[x, y] = (r, g, b, 0)
        elif d < hi:
            t = (d - lo) / (hi - lo)
            pix[x, y] = (r, g, b, int(a * t))

bbox = im.getbbox()
pad = 12
x0 = max(0, bbox[0] - pad)
y0 = max(0, bbox[1] - pad)
x1 = min(w, bbox[2] + pad)
y1 = min(h, bbox[3] + pad)
cut = im.crop((x0, y0, x1, y1))
cut.save(logo_out)
print("logo", cut.size, logo_out)

original = Image.open(src).convert("RGBA")
original.resize((64, 64), Image.Resampling.LANCZOS).save(fav_out)
original.resize((192, 192), Image.Resampling.LANCZOS).save(fav_svg_dir)
print("favicon written")
