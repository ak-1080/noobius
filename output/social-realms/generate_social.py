from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

ROOT=Path(__file__).parent
GEN=ROOT/'source'
CHAR={
 'tool':GEN/'noobius-tool.png',
 'gpu':GEN/'noobius-gpu.png',
 'cool':GEN/'noobius-cool.png',
}
W,H=1920,1080
FONT='/System/Library/Fonts/Avenir Next.ttc'
MONO='/System/Library/Fonts/SFNSMono.ttf'
def f(size,idx=0):return ImageFont.truetype(FONT,size,index=idx)
def mf(size):return ImageFont.truetype(MONO,size)
def color(h):return tuple(int(h[i:i+2],16) for i in (1,3,5))
def rr(draw,xy,fill,r=20,outline=None,width=2):draw.rounded_rectangle(xy,radius=r,fill=fill,outline=outline,width=width)
def add_glow(im,x,y,r,accent,opacity=100):
 layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
 d.ellipse((x-r,y-r,x+r,y+r),fill=(*color(accent),opacity))
 im.alpha_composite(layer.filter(ImageFilter.GaussianBlur(r//2)))
def add_scene(path,accent):
 im=Image.open(path).convert('RGBA').resize((W,H),Image.Resampling.LANCZOS)
 # Darkening gradient preserves real geometry and opens a readable editorial column.
 a=np.asarray(im).copy().astype(np.float32)
 yy,xx=np.mgrid[:H,:W]
 shade=0.63*np.maximum(0,1-xx/1030)**1.35 + 0.14*np.maximum(0,(yy-740)/340)
 tint=np.array([5,13,21],dtype=np.float32)
 a[:,:,:3]=a[:,:,:3]*(1-shade[:,:,None])+tint*shade[:,:,None]
 im=Image.fromarray(a.astype(np.uint8),'RGBA')
 add_glow(im,1660,375,330,accent,80)
 add_glow(im,490,800,310,accent,65)
 return im

def paste_character(im,key,x,y,height):
 c=Image.open(CHAR[key]).convert('RGBA')
 c.thumbnail((820,height),Image.Resampling.LANCZOS)
 # preserve feet and full face, cool shadow with soft edge
 sh=Image.new('RGBA',c.size,(0,0,0,0));sh.putalpha(c.getchannel('A').filter(ImageFilter.GaussianBlur(18)))
 under=Image.new('RGBA',c.size,(2,13,22,0));under.putalpha(sh.getchannel('A').point(lambda v:int(v*.66)))
 im.alpha_composite(under,(x+18,y+25))
 im.alpha_composite(c,(x,y))
 return c.size

def heading(draw,lines,accent):
 rr(draw,(70,64,323,116),fill=(14,31,39,235),r=24,outline=(*color(accent),170),width=2)
 draw.text((91,74),'noobius',font=f(33,0),fill=(244,249,247))
 draw.ellipse((260,92,271,103),fill=color(accent))
 draw.text((74,157),lines[0],font=f(92,8),fill=(246,250,247),stroke_width=1,stroke_fill=(2,9,15))
 draw.text((74,249),lines[1],font=f(92,8),fill=color(accent),stroke_width=1,stroke_fill=(2,9,15))

def speech(im,text,x,y,width,accent):
 draw=ImageDraw.Draw(im)
 words=text.split();lines=[];line=''
 for word in words:
  test=(line+' '+word).strip()
  if draw.textlength(test,font=f(31,2))>width-80 and line:lines.append(line);line=word
  else:line=test
 lines.append(line)
 h=44+len(lines)*42
 # Stem points down-left, toward Noobius.
 draw.polygon([(x+64,y+h-1),(x+30,y+h+48),(x+129,y+h-1)],fill=(243,248,238,248))
 rr(draw,(x,y,x+width,y+h),fill=(243,248,238,250),r=26,outline=(*color(accent),220),width=3)
 for i,line in enumerate(lines):draw.text((x+38,y+20+i*42),line,font=f(31,2),fill=(16,35,42))

def callout(im,num,title,detail,x,y,ax,ay,accent):
 d=ImageDraw.Draw(im)
 boxw=375;boxh=102
 sx=x+35 if ax<x else x+boxw-35
 sy=y+boxh//2
 d.line((sx,sy,ax,ay),fill=(*color(accent),185),width=3)
 d.ellipse((ax-7,ay-7,ax+7,ay+7),fill=color(accent),outline=(244,250,249),width=2)
 rr(d,(x,y,x+boxw,y+boxh),fill=(8,25,34,229),r=20,outline=(*color(accent),205),width=2)
 d.text((x+18,y+17),num,font=mf(18),fill=color(accent))
 d.text((x+70,y+11),title.upper(),font=f(25,0),fill=(244,249,247))
 d.text((x+70,y+52),detail,font=f(20,5),fill=(193,214,216))

def footer(im,index,realm,accent,activity):
 d=ImageDraw.Draw(im)
 d.line((78,1006,1842,1006),fill=(*color(accent),150),width=2)
 d.text((80,1021),f'NOOBIUS // {realm.upper()}',font=mf(18),fill=(226,240,240))
 d.text((795,1021),activity.upper(),font=mf(18),fill=color(accent))
 d.text((1665,1021),f'{index:02d} / 04',font=mf(18),fill=(226,240,240))

def realm_poster(cfg):
 im=add_scene(ROOT/f"preview-{cfg['id']}.png",cfg['accent'])
 d=ImageDraw.Draw(im)
 heading(d,cfg['title'],cfg['accent'])
 d.text((80,375),cfg['subtitle'][0],font=f(29,5),fill=(229,240,236))
 d.text((80,413),cfg['subtitle'][1],font=f(29,5),fill=(229,240,236))
 rr(d,(79,485,349,531),fill=(*color(cfg['accent']),235),r=22)
 d.text((102,492),cfg['tag'],font=mf(19),fill=(14,31,39))
 paste_character(im,cfg['char'],74,548,cfg.get('char_h',574))
 speech(im,cfg['bubble'],470,745,440,cfg['accent'])
 for cc in cfg['callouts']:callout(im,*cc,cfg['accent'])
 footer(im,cfg['num'],cfg['name'],cfg['accent'],cfg['activity'])
 out=ROOT/f"{cfg['num']:02d}-{cfg['id']}-social.png"
 im.convert('RGB').save(out,optimize=True)
 print(out)

configs=[
 dict(num=1,id='commons',name='Crew Commons',accent='#c4ef91',title=('THE SHIFT','STARTS HERE.'),subtitle=('Salvage working parts.','Build your own data center.'),tag='FREE REALM · LEVEL 1',char='tool',bubble='This one still works. I think.',activity='Sort · recover · build',callouts=[('01','WIRE EXCHANGE','Recover copper wire',1150,275,1294,190),('02','COMPONENT LINE','Turn parts into repair kits',1375,755,1650,630)]),
 dict(num=2,id='thermal',name='Cooling Works',accent='#72e7dc',title=('KEEP YOUR','COOL.'),subtitle=('Route coolant through the loop.','Keep the racks online.'),tag='FREE REALM · LEVEL 3',char='cool',bubble='Why is that gauge red?',activity='Route pipes · recover coolant',callouts=[('01','HEAT EXCHANGER','Balance the line',1160,295,1375,170),('02','PUMP HOUSE','Refurbish the pumps',1375,755,1600,790)]),
 dict(num=3,id='gpu',name='GPU District',accent='#adbdff',title=('WAKE THE','MACHINES.'),subtitle=('Schedule live and batch work.','Qualify recovered chips.'),tag='HOLDER REALM',char='gpu',bubble='We need more GPUs. Again?',activity='Balance loads · qualify chips',callouts=[('01','BATCH FOUNDRY','Fit jobs into capacity',1160,290,1385,175),('02','CHIP LABORATORY','Test salvaged silicon',1380,757,1580,755)]),
 dict(num=4,id='core',name='Archive Depths',accent='#f4ba7e',title=('SAVE THE','LAST COPY.'),subtitle=('Find a compatible checkpoint.','Rescue boards and data cores.'),tag='HOLDER REALM',char='tool',bubble='Please be the right backup.',activity='Recover · verify · restore',callouts=[('01','MIRROR CHAMBER','Trace the complete copy',1160,280,1400,145),('02','COLD ARCHIVE','Rescue the data core',1380,756,1570,830)]),
]
for c in configs:realm_poster(c)

# Fifth: an editorial map of the full shift, from four actual scene captures.
im=Image.new('RGBA',(W,H),(9,24,32,255)); add_glow(im,955,550,500,'#bde991',68)
d=ImageDraw.Draw(im)
for i,(rid,label,sub,accent) in enumerate([('commons','01 / CREW COMMONS','SALVAGE','#c4ef91'),('thermal','02 / COOLING WORKS','COOLING','#72e7dc'),('gpu','03 / GPU DISTRICT','COMPUTE','#adbdff'),('core','04 / ARCHIVE DEPTHS','RECOVERY','#f4ba7e')]):
 x=70+(i%2)*900;y=265+(i//2)*365;bw=850;bh=330
 sc=Image.open(ROOT/f'preview-{rid}.png').convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
 # Show key landmarks inside compact map windows.
 crop=sc.crop((100,60,1810,875)).resize((bw,bh),Image.Resampling.LANCZOS)
 mask=Image.new('L',(bw,bh));ImageDraw.Draw(mask).rounded_rectangle((0,0,bw-1,bh-1),radius=24,fill=255)
 im.paste(crop,(x,y),mask)
 tint=Image.new('RGBA',(bw,bh),(4,17,26,50));im.alpha_composite(tint,(x,y))
 d=ImageDraw.Draw(im);rr(d,(x,y,x+bw,y+bh),fill=None,r=24,outline=(*color(accent),230),width=3)
 label_x=x+17 if i!=3 else x+420
 rr(d,(label_x,y+18,label_x+393,y+77),fill=(7,24,31,230),r=19,outline=(*color(accent),195),width=2)
 d.text((label_x+17,y+30),label,font=f(25,0),fill=(245,251,247))
 rr(d,(x+bw-166,y+bh-60,x+bw-18,y+bh-18),fill=(6,20,29,225),r=18)
 d.text((x+bw-150,y+bh-52),sub,font=mf(18),fill=color(accent))
# Character anchors the 4-pane map, overlapping their joins.
paste_character(im,'gpu',771,315,715)
d=ImageDraw.Draw(im)
rr(d,(70,58,317,108),fill=(13,33,40,240),r=24,outline=(195,238,144,190),width=2)
d.text((89,66),'noobius',font=f(33,0),fill=(247,250,247));d.ellipse((257,85,269,97),fill=color('#c4ef91'))
d.text((71,131),'FOUR REALMS.',font=f(69,8),fill=(247,250,247))
d.text((668,131),'ONE VERY CONFUSED WORKER.',font=f(57,8),fill=color('#c4ef91'))
speech(im,'How many shifts did I sign up for?',1100,850,618,'#c4ef91')
d=ImageDraw.Draw(im);d.text((72,1035),'NOOBIUS // THE NIGHT SHIFT',font=mf(19),fill=(225,238,234));d.text((1654,1035),'NOOBIUS.IO',font=mf(19),fill=color('#c4ef91'))
out=ROOT/'05-four-realms-social.png';im.convert('RGB').save(out,optimize=True);print(out)
