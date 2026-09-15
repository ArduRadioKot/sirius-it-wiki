from pathlib import Path
from fractions import Fraction as F
import re
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

ROOT=Path('/Users/aleksandrvorobev/Documents/university/sirius-it-wiki')
OUT=ROOT/'output/pdf/zadacha_4_reshenie.pdf'
FONT=Path('/System/Library/Fonts/Supplemental')
for name,path in [('Body','Arial.ttf'),('Strong','Arial Bold.ttf'),('Math','Times New Roman Italic.ttf'),('Roman','Times New Roman.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(FONT/path)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Strong',italic='Math',boldItalic='Strong')
W,H=595.28,841.89
LEFT,RIGHT=45,W-45
CW=RIGHT-LEFT
INK=colors.HexColor('#20313B')
BLUE=colors.HexColor('#116AA5')
ORANGE=colors.HexColor('#BD4C28')
GRAY=colors.HexColor('#6A7B88')
LIGHT=colors.HexColor('#D9E4EB')
PALE=colors.HexColor('#F1F6F9')
c=canvas.Canvas(str(OUT),pagesize=(W,H))
c.setTitle('Задача 4. Краткое и подробное решение с рисунками')
c.setSubject('Решение обоих пунктов через теорему Чевы, подобие и средние линии')
c.setAuthor('')
style=ParagraphStyle('body',fontName='Body',fontSize=11,leading=16,textColor=INK)
small=ParagraphStyle('small',parent=style,fontSize=9.3,leading=13,textColor=GRAY)
y=0
def paragraph(s,gap=9,sty=style,x=LEFT,width=CW):
    global y
    p=Paragraph(s,sty);_,h=p.wrap(width,800);p.drawOn(c,x,y-h);y-=h+gap
def heading(t):
    global y
    c.setFillColor(BLUE);c.setFont('Strong',12);c.drawString(LEFT,y-12,t);y-=25
def start(page,title,sub):
    global y
    c.setFillColor(BLUE);c.setFont('Strong',9.5);c.drawString(LEFT,H-36,'ЗАДАЧА 4  /  ПЛАНИМЕТРИЯ')
    c.setFillColor(INK);c.setFont('Strong',22);c.drawString(LEFT,H-73,title)
    c.setFillColor(GRAY);c.setFont('Body',10);c.drawString(LEFT,H-93,sub)
    c.setStrokeColor(LIGHT);c.line(LEFT,39,RIGHT,39)
    c.setFillColor(GRAY);c.setFont('Body',8.5);c.drawString(LEFT,24,'Теорема Чевы и средние линии');c.drawRightString(RIGHT,24,f'{page} / 4')
    y=H-115
def end():
    assert y>=48,(c.getPageNumber(),y)
    c.showPage()
def note(t,color=BLUE):
    global y
    st=ParagraphStyle('note',parent=style,fontSize=10.3,leading=15)
    p=Paragraph(t,st);_,h=p.wrap(CW-26,800)
    c.setFillColor(PALE);c.roundRect(LEFT,y-h-20,CW,h+20,6,fill=1,stroke=0)
    c.setStrokeColor(color);c.setLineWidth(2.3);c.line(LEFT+1,y-7,LEFT+1,y-h-13)
    p.drawOn(c,LEFT+13,y-h-10);y-=h+31

# Text drawing with true numeric subscripts, so no font fallback is needed.
def tw(s,size=14,font='Math'):
    width=0
    for token in re.findall(r'_[0-9]+|[^_]+',s):
        sub=token.startswith('_');width+=pdfmetrics.stringWidth(token[1:] if sub else token,font,size*.68 if sub else size)
    return width
def mathtext(s,x,yy,size=14,col=INK,font='Math'):
    c.setFillColor(col)
    for token in re.findall(r'_[0-9]+|[^_]+',s):
        sub=token.startswith('_');txt=token[1:] if sub else token;fs=size*.68 if sub else size
        c.setFont(font,fs);c.drawString(x,yy-size*.23 if sub else yy,txt)
        x+=pdfmetrics.stringWidth(txt,font,fs)
    return x
def formula(parts,size=15,gap=10):
    global y
    widths=[max(tw(p[0],size),tw(p[1],size))+9 if isinstance(p,tuple) else tw(p,size) for p in parts]
    x=(W-sum(widths))/2
    assert sum(widths)<CW
    for part,width in zip(parts,widths):
        if isinstance(part,tuple):
            mathtext(part[0],x+(width-tw(part[0],size))/2,y-12,size)
            c.setStrokeColor(INK);c.setLineWidth(.65);c.line(x+2,y-17,x+width-2,y-17)
            mathtext(part[1],x+(width-tw(part[1],size))/2,y-33,size)
        else:mathtext(part,x,y-22,size)
        x+=width
    y-=40+gap
def add(a,b):return (a[0]+b[0],a[1]+b[1])
def sub(a,b):return (a[0]-b[0],a[1]-b[1])
def mul(a,k):return (a[0]*k,a[1]*k)
def mid(a,b):return mul(add(a,b),F(1,2))
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def on_line(p,a,b):return cross(sub(p,a),sub(b,a))==0

# All construction coordinates are exact fractions.
A=(F(11,5),F(5));B=(F(0),F(0));C=(F(8),F(0))
aa,bb,cc=F(1,4),F(3,20),F(3,5)
P=add(add(mul(A,aa),mul(B,bb)),mul(C,cc))
A1=mul(add(mul(B,bb),mul(C,cc)),1/(bb+cc))
B1=mul(add(mul(C,cc),mul(A,aa)),1/(cc+aa))
C1=mul(add(mul(A,aa),mul(B,bb)),1/(aa+bb))
M,N,K=mid(B,C),mid(C,A),mid(A,B)
X,Y,Z=mid(A,A1),mid(B,B1),mid(C,C1)
G=mul(add(add(A,B),C),F(1,3))
Q=add(mul(G,F(3,2)),mul(P,F(-1,2)))
D=mul(sub(add(add(A,B),C),A1),F(1,2))
E=mul(sub(add(add(A,B),C),B1),F(1,2))
FF=mul(sub(add(add(A,B),C),C1),F(1,2))
T=mul(add(add(mul(A,1/aa),mul(B,1/bb)),mul(C,1/cc)),1/(1/aa+1/bb+1/cc))
R=mul(sub(add(add(A,B),C),T),F(1,2))
assert all(on_line(P,v,w) for v,w in [(A,A1),(B,B1),(C,C1)])
assert all(cross(sub(Q,m),sub(P,v))==0 for m,v in [(M,A),(N,B),(K,C)])
assert all(on_line(z,v,w) for z,v,w in [(D,N,K),(E,K,M),(FF,M,N),(Q,M,D),(Q,N,E),(Q,K,FF)])
assert all(on_line(z,v,w) for z,v,w in [(X,N,K),(Y,K,M),(Z,M,N),(R,M,X),(R,N,Y),(R,K,Z)])

class Diagram:
    def __init__(self,origin,scale):self.origin=origin;self.scale=scale
    def xy(self,p):return (self.origin[0]+float(p[0])*self.scale,self.origin[1]+float(p[1])*self.scale)
    def line(self,p,q,color=INK,width=1.2,dash=False):
        c.setStrokeColor(color);c.setLineWidth(width);c.setDash(3,3) if dash else c.setDash()
        c.line(*self.xy(p),*self.xy(q));c.setDash()
    def point(self,p,t,dx=6,dy=5,color=INK):
        xx,yy=self.xy(p);c.setFillColor(colors.white);c.circle(xx,yy,3,fill=1,stroke=0)
        c.setFillColor(color);c.circle(xx,yy,2.1,fill=1,stroke=0)
        mathtext(t,xx+dx,yy+dy,13,color)
    def triangle(self,a,b,d,color=INK,width=1.2):
        for v,w in [(a,b),(b,d),(d,a)]:self.line(v,w,color,width)
def caption(t,yy):
    p=Paragraph(t,small);_,h=p.wrap(CW,70);p.drawOn(c,LEFT,yy-h)

start(1,'Краткое решение','Оба пункта решаются через теорему Чевы.')
paragraph('<b>Дано.</b> AP, BP, CP пересекают BC, CA, AB (или их продолжения) в точках A<sub>1</sub>, B<sub>1</sub>, C<sub>1</sub> соответственно.')
paragraph('<b>Обозначения.</b> M, N, K - середины сторон BC, CA, AB; X, Y, Z - середины отрезков AA<sub>1</sub>, BB<sub>1</sub>, CC<sub>1</sub>. Точки пересечения в пунктах а) и б) назовём Q и R.')
paragraph('<b>Доказать:</b> а) прямые через M, N, K, параллельные AP, BP, CP соответственно, пересекаются в одной точке; б) прямые MX, NY, KZ пересекаются в одной точке.')
note('Пункт а) верен и для внешней точки P. Для пункта б) ниже дано доказательство при P внутри ABC. Если разрешить продолжения сторон без дополнительных условий, возможны три параллельные прямые; это проверено на странице 4.')
heading('а) Перенос отношений Чевы')
paragraph('Прямые через M, N, K, параллельные AP, BP, CP, пересекают NK, KM, MN в D, E, F соответственно. По подобию треугольников:')
formula([('ND','DK'),' = ',('BA_1','A_1C'),',    ',('KE','EM'),' = ',('CB_1','B_1A'),',    ',('MF','FN'),' = ',('AC_1','C_1B')],size=14,gap=6)
paragraph('По Чеве в ABC произведение правых частей равно 1. По обратной Чеве в MNK прямые MD, NE, KF имеют общую точку Q. Параллельный случай невозможен: тогда AP, BP, CP тоже были бы параллельны.')
heading('б) Обратные отношения Чевы')
paragraph('Пусть P внутри ABC. Тогда X лежит на NK, Y - на KM, Z - на MN. По теореме о средней линии:')
formula([('NX','XK'),' = ',('CA_1','A_1B'),',    ',('KY','YM'),' = ',('AB_1','B_1C'),',    ',('MZ','ZN'),' = ',('BC_1','C_1A')],size=14)
paragraph('По теореме Чевы в ABC произведение трёх отношений справа равно 1. Поэтому')
formula([('NX','XK'),' · ',('KY','YM'),' · ',('MZ','ZN'),' = 1.'])
paragraph('Обратная теорема Чевы в треугольнике MNK даёт общую точку R прямых MX, NY, KZ. Пункт б) для внутренней точки P доказан.')
paragraph('Подробный разбор и рисунки - на страницах 2-3. Оговорка к пункту б), также без координат, - на странице 4.',sty=small)
end()

start(2,'Подробно: пункт а)','Подобие даёт отношения; теорема Чевы - общую точку.')
paragraph('<b>1. Введём точки D, E, F.</b> Проведём MD параллельно AA<sub>1</sub>, NE параллельно BB<sub>1</sub>, KF параллельно CC<sub>1</sub>; D лежит на прямой NK, E - на KM, F - на MN. Эти пересечения существуют, поскольку исходные прямые пересекают соответствующие стороны.')
paragraph('<b>2. Найдём отношения.</b> MN, MK, NK - средние линии ABC. В треугольниках MND и ABA<sub>1</sub> соответствующие стороны параллельны, а MN = AB/2. Значит, ND = BA<sub>1</sub>/2. Из подобия MKD и ACA<sub>1</sub> получаем DK = A<sub>1</sub>C/2. Аналогично находим два других отношения:')
formula([('ND','DK'),' = ',('BA_1','A_1C'),',    ',('KE','EM'),' = ',('CB_1','B_1A'),',    ',('MF','FN'),' = ',('AC_1','C_1B')],size=14,gap=6)
paragraph('<b>3. Дважды применим Чеву.</b> В ABC правые части дают произведение 1, так как AA<sub>1</sub>, BB<sub>1</sub>, CC<sub>1</sub> проходят через P. Поэтому в MNK произведение ND/DK · KE/EM · MF/FN равно 1. По обратной Чеве MD, NE, KF пересекаются в Q или параллельны. Второе невозможно: тогда AA<sub>1</sub>, BB<sub>1</sub>, CC<sub>1</sub> тоже были бы параллельны.')
note('Для продолжений сторон используем отношения со знаком: при внутреннем делении стороны отношение положительно, при внешнем - отрицательно. Равенства отношений из подобия сохраняются. Пункт а) доказан и для внешней точки P.')
assert y>348,y
d=Diagram((105,101),43)
for v,w in [(A,A1),(B,B1),(C,C1)]:d.line(v,w,GRAY,.85,True)
d.triangle(A,B,C)
d.triangle(M,N,K,LIGHT,1)
for v,w in [(M,D),(N,E),(K,FF)]:d.line(v,w,BLUE,1.8)
for p,t,dx,dy,col in [(A,'A',-5,9,INK),(B,'B',-15,-8,INK),(C,'C',6,-8,INK),(M,'M',-6,-19,BLUE),(N,'N',6,6,BLUE),(K,'K',-20,2,BLUE),(P,'P',7,-6,INK),(Q,'Q',-15,-16,BLUE),(A1,'A_1',-2,-19,INK),(B1,'B_1',7,0,INK),(C1,'C_1',-23,5,INK),(D,'D',-3,8,BLUE),(E,'E',-17,-7,BLUE),(FF,'F',7,2,BLUE)]:d.point(p,t,dx,dy,col)
caption('Рис. 1. Синие прямые MD, NE, KF параллельны AA<sub>1</sub>, BB<sub>1</sub>, CC<sub>1</sub> соответственно. Чева применяется сначала к ABC, затем к MNK.',72)
y=48
end()

start(3,'Подробно: пункт б)','Предполагаем, что P лежит внутри треугольника ABC.')
paragraph('<b>1. Где находятся X, Y, Z?</b> В треугольнике AA<sub>1</sub>C отрезок NX - средняя линия, поэтому NX = CA<sub>1</sub>/2. В треугольнике AA<sub>1</sub>B отрезок KX - средняя линия, поэтому XK = A<sub>1</sub>B/2. Оба отрезка параллельны BC, значит, N, X, K лежат на одной прямой. Аналогично получаем Y на KM и Z на MN.')
formula([('NX','XK'),' = ',('CA_1','A_1B'),',    ',('KY','YM'),' = ',('AB_1','B_1C'),',    ',('MZ','ZN'),' = ',('BC_1','C_1A')],size=14,gap=7)
paragraph('<b>2. Применим Чеву к ABC.</b> Поскольку AA<sub>1</sub>, BB<sub>1</sub>, CC<sub>1</sub> проходят через P, имеем:')
formula([('BA_1','A_1C'),' · ',('CB_1','B_1A'),' · ',('AC_1','C_1B'),' = 1.'],gap=7)
paragraph('<b>3. Применим обратную теорему к MNK.</b> Произведение отношений из шага 1 обратно произведению из шага 2 и тоже равно 1. Поэтому отрезки MX, NY, KZ, соединяющие вершины MNK с точками на противоположных сторонах, имеют общую точку R.')
assert y>365,y
d=Diagram((105,101),47)
for v,w in [(A,A1),(B,B1),(C,C1)]:d.line(v,w,GRAY,.85,True)
d.triangle(A,B,C)
d.triangle(M,N,K,BLUE,1)
for v,w in [(M,X),(N,Y),(K,Z)]:d.line(v,w,ORANGE,2)
for p,t,dx,dy,col in [(A,'A',-5,9,INK),(B,'B',-16,-8,INK),(C,'C',6,-8,INK),(M,'M',-6,-19,BLUE),(N,'N',7,4,BLUE),(K,'K',-20,2,BLUE),(A1,'A_1',-2,-19,INK),(B1,'B_1',7,0,INK),(C1,'C_1',-22,4,INK),(X,'X',-5,8,ORANGE),(Y,'Y',-17,-11,ORANGE),(Z,'Z',5,5,ORANGE),(R,'R',-17,1,ORANGE),(P,'P',7,-8,INK)]:d.point(p,t,dx,dy,col)
caption('Рис. 2. Синий треугольник MNK - срединный. Оранжевые отрезки MX, NY, KZ пересекаются в R. Точки P и R, вообще говоря, различны.',72)
y=48
end()

start(4,'Случай продолжений сторон','Геометрический контрпример к пункту б), также с использованием Чевы.')
paragraph('<b>1. Построим исходные прямые.</b> На продолжении CB за B возьмём A<sub>1</sub> так, чтобы BA<sub>1</sub> = BC, а на продолжении CA за A возьмём B<sub>1</sub> так, чтобы AB<sub>1</sub> = AC. Положим C<sub>1</sub> = K. Для отношений со знаком:')
formula([('BA_1','A_1C'),' · ',('CB_1','B_1A'),' · ',('AC_1','C_1B'),' = (−1/2) · (−2) · 1 = 1.'],size=14,gap=6)
paragraph('По обратной Чеве AA<sub>1</sub>, BB<sub>1</sub>, CK имеют общую точку P. Параллельность здесь исключена: AB - средняя линия треугольника CA<sub>1</sub>B<sub>1</sub>, поэтому A<sub>1</sub>B<sub>1</sub> = 2AB. Если бы AA<sub>1</sub> и BB<sub>1</sub> были параллельны, четырёхугольник ABB<sub>1</sub>A<sub>1</sub> был бы параллелограммом, что требовало бы A<sub>1</sub>B<sub>1</sub> = AB.')
paragraph('<b>2. Проверим прямые из пункта б).</b> По формулам средних линий из предыдущего решения K - середина NX и MY, а Z - середина MN. Значит, MNYX - параллелограмм: его диагонали делятся пополам. Поэтому MX параллельна NY. В треугольнике MNX отрезок KZ - средняя линия, поэтому он тоже параллелен MX.')
note('Получились три различные параллельные прямые MX, NY, KZ. Поэтому для пункта б) нужно либо предполагать P внутри ABC, либо допускать в заключении параллельность. Для пункта а) такого исключения нет.',color=ORANGE)
assert y>337,y

AA=(F(0),F(0));BB=(F(4),F(0));CC=(F(0),F(4));PP=(F(8,3),F(-4,3))
AA1=(F(8),F(-4));BB1=(F(0),F(-4));CC1=(F(2),F(0))
MM,NN,KK=mid(BB,CC),mid(CC,AA),mid(AA,BB)
XX,YY,ZZ=mid(AA,AA1),mid(BB,BB1),mid(CC,CC1)
assert all(on_line(PP,v,w) for v,w in [(AA,AA1),(BB,BB1),(CC,CC1)])
assert all(2*p[0]+p[1]==b0 for p,q,b0 in [(MM,XX,6),(NN,YY,2),(KK,ZZ,4)] for p in [p,q])
d=Diagram((150,207),27)
for v,w in [(BB,AA1),(AA,BB1),(AA,AA1),(BB,BB1),(CC,PP)]:d.line(v,w,GRAY,.8,True)
d.triangle(AA,BB,CC)
d.line(AA1,BB1,LIGHT,.8,True)
d.line(NN,XX,BLUE,.8,True)
d.line(MM,YY,BLUE,.8,True)
d.line(MM,NN,BLUE,.8)
for b0 in [6,2,4]:d.line((F(b0-3,2),F(3)),(F(b0+3,2),F(-3)),ORANGE,1.9)
for p,t,dx,dy,col in [(AA,'A',-17,3,INK),(BB,'B',7,1,INK),(CC,'C',-17,4,INK),(AA1,'A_1',6,-7,INK),(BB1,'B_1',-24,-7,INK),(CC1,'K',5,7,INK),(MM,'M',6,4,ORANGE),(NN,'N',-20,0,ORANGE),(XX,'X',6,-4,ORANGE),(YY,'Y',-17,-6,ORANGE),(ZZ,'Z',-5,8,ORANGE),(PP,'P',8,1,BLUE)]:d.point(p,t,dx,dy,col)
caption('Рис. 3. Все исходные прямые проходят через синюю точку P, но оранжевые прямые MX, NY и KZ попарно параллельны.',73)
y=48
end()
c.save()
print('Created:',OUT)
print('Exact geometric checks passed: original concurrence, midpoint incidences, part (a) directions, part (b) concurrence, parallel counterexample.')
