from PIL import Image
import sys

try:
    img = Image.open('public/images/bg.png')
    img = img.convert('RGB')
    img = img.resize((512, 512), Image.Resampling.LANCZOS)
    img.save('public/images/bg_optimized.png', 'PNG', optimize=True)
    print("Optimization successful")
except Exception as e:
    print(f"Error: {e}")
