import os
from PIL import Image, ImageDraw, ImageFont

def generate_default_share_card():
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), '#0f172a')
    draw = ImageDraw.Draw(img)

    font_dir = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
    
    # Fonts
    font_title = ImageFont.truetype(os.path.join(font_dir, 'georgiab.ttf'), 54)
    font_archive = ImageFont.truetype(os.path.join(font_dir, 'georgiab.ttf'), 26)
    font_bureau = ImageFont.truetype(os.path.join(font_dir, 'georgia.ttf'), 20)
    font_badge = ImageFont.truetype(os.path.join(font_dir, 'arialbd.ttf'), 14)
    font_meta = ImageFont.truetype(os.path.join(font_dir, 'arialbd.ttf'), 16)
    font_body = ImageFont.truetype(os.path.join(font_dir, 'arial.ttf'), 15)
    font_url = ImageFont.truetype(os.path.join(font_dir, 'arialbd.ttf'), 16)

    # Outer slate and gold borders
    draw.rectangle([20, 20, W - 21, H - 21], outline='#1e293b', width=2)
    draw.rectangle([25, 25, W - 26, H - 26], outline='#d97706', width=2)

    # Top crimson accent header strip
    draw.rectangle([27, 27, W - 27, 36], fill='#dc2626')

    # Top kicker pill badge
    kicker_text = 'HINDUSTAN TIMES  •  PATNA BUREAU  •  35+ YEARS OF JOURNALISM'
    k_bbox = font_badge.getbbox(kicker_text)
    kw, kh = k_bbox[2] - k_bbox[0], k_bbox[3] - k_bbox[1]
    kx, ky = 60, 65
    draw.rounded_rectangle([kx, ky, kx + kw + 24, ky + kh + 14], radius=6, fill='#1e293b', outline='#d97706', width=1)
    draw.text((kx + 12, ky + 6), kicker_text, font=font_badge, fill='#fbbf24')

    # Main Title
    draw.text((60, 115), 'ARUN KUMAR', font=font_title, fill='#f8fafc')

    # Archive Subtitle
    draw.text((60, 185), 'LIVING JOURNALISTIC ARCHIVE', font=font_archive, fill='#fbbf24')
    draw.text((60, 222), 'Patna Bureau (35+ Years)', font=font_bureau, fill='#94a3b8')

    # Crimson + Gold divider line
    draw.line([(60, 260), (810, 260)], fill='#dc2626', width=3)
    draw.line([(60, 264), (360, 264)], fill='#d97706', width=2)

    # Designation & Honors
    draw.text((60, 280), 'Associate Editor, Hindustan Times', font=font_meta, fill='#e2e8f0')
    draw.text((60, 310), 'Recipient of K.C. Kulish International Award for Excellence in Print Journalism', font=font_meta, fill='#f59e0b')

    # Reporting beats
    draw.text((60, 358), 'PRIMARY COVERAGE & INVESTIGATIVE BEATS:', font=font_badge, fill='#94a3b8')

    beats = [
        '• Bihar Politics, State Elections & Coalition Governance',
        '• Higher Education Administration & Chancellery Statute Reforms',
        '• Patna High Court Jurisprudence & Vigilance Investigations',
        '• Administrative Governance, Policy Implementation & Public Affairs'
    ]

    by = 386
    for b in beats:
        draw.text((60, by), b, font=font_body, fill='#cbd5e1')
        by += 26

    # Bottom status bar
    draw.rectangle([27, H - 72, W - 27, H - 27], fill='#0b1120')
    draw.line([(27, H - 72), (W - 27, H - 72)], fill='#1e293b', width=1)
    draw.text((60, H - 56), 'AUTHENTIC REPOSITORY  •  100% UNEDITED SOURCE TEXT  •  WAYBACK ARCHIVE VERIFIED', font=font_badge, fill='#64748b')
    draw.text((W - 320, H - 56), 'arunkumar-journalism.org', font=font_url, fill='#fbbf24')

    # Portrait section on right
    portrait_path = 'site/public/images/author/arun_kumar_portrait.jpg'
    if os.path.exists(portrait_path):
        p_img = Image.open(portrait_path).convert('RGB')
        p_size = 230
        p_img = p_img.resize((p_size, p_size), Image.Resampling.LANCZOS)
        
        # Circular mask
        mask = Image.new('L', (p_size, p_size), 0)
        m_draw = ImageDraw.Draw(mask)
        m_draw.ellipse((0, 0, p_size, p_size), fill=255)
        
        px, py = 880, 130
        
        # Dual decorative ring border
        draw.ellipse([px - 8, py - 8, px + p_size + 8, py + p_size + 8], outline='#dc2626', width=2)
        draw.ellipse([px - 4, py - 4, px + p_size + 4, py + p_size + 4], outline='#d97706', width=3)
        
        img.paste(p_img, (px, py), mask)
        
        # Portrait Caption
        c1 = 'Arun Kumar'
        c1_bbox = font_meta.getbbox(c1)
        c1_w = c1_bbox[2] - c1_bbox[0]
        draw.text((px + (p_size - c1_w) // 2, py + p_size + 18), c1, font=font_meta, fill='#f8fafc')
        
        c2 = 'Hindustan Times'
        c2_bbox = font_body.getbbox(c2)
        c2_w = c2_bbox[2] - c2_bbox[0]
        draw.text((px + (p_size - c2_w) // 2, py + p_size + 42), c2, font=font_body, fill='#94a3b8')

    out_dir = 'site/public/images/share'
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'default_share_card.jpg')
    img.save(out_path, 'JPEG', quality=95, subsampling=0)
    print(f'Successfully created {out_path} ({os.path.getsize(out_path)} bytes)')

if __name__ == '__main__':
    generate_default_share_card()
