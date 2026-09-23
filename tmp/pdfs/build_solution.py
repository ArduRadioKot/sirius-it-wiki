from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path

ROOT=Path('/Users/aleksandrvorobev/Documents/university/sirius-it-wiki')
OUT=ROOT/'output/pdf/zadacha_4_reshenie.pdf'
for name, file in [('Text','Arial.ttf'),('Bold','Arial Bold.ttf'),('Italic','Arial Italic.ttf')]:
    pdfmetrics.registerFont(TTFont(name,'/System/Library/Fonts/Supplemental/'+file))
pdfmetrics.registerFontFamily('Text',normal='Text',bold='Bold',italic='Italic',boldItalic='Bold')
W,H=595.28,841.89
c=canvas.Canvas(str(OUT),pagesize=(W,H))
c.setTitle('Задача 4. Середины сторон и пересечение прямых')
c.setAuthor('')
ink=colors.HexColor('#172B3A'); blue=colors.HexColor('#1975A5'); red=colors.HexColor('#C24D36'); gray=colors.HexColor('#8C99A1')
style=ParagraphStyle('body',fontName='Text',fontSize=11,leading=16,textColor=ink)
y=0
def para(s,gap=9):
    global y
    p=Paragraph(s,style); _,h=p.wrap(W-88,700); p.drawOn(c,44,y-h); y-=h+gap
def title(n,t,sub):
    global y
    c.setFillColor(blue); c.setFont('Bold',10); c.drawString(44,H-38,'ГЕОМЕТРИЯ  /  ЗАДАЧА 4')
    c.setFillColor(ink); c.setFont('Bold',21); c.drawString(44,H-72,t)
    c.setFont('Text',10); c.setFillColor(gray); c.drawString(44,H-91,sub)
    y=H-114
    c.setStrokeColor(colors.HexColor('#DCE3E8')); c.line(44,40,W-44,40)
    c.setFillColor(gray); c.setFont('Text',9); c.drawString(44,25,'Середины сторон и теорема Чевы'); c.drawRightString(W-44,25,str(n))
def section(s):
    global y
    c.setFillColor(blue); c.setFont('Bold',12); c.drawString(44,y-12,s); y-=25
def add(a,b): return (a[0]+b[0],a[1]+b[1])
def mul(a,k): return (a[0]*k,a[1]*k)
def mid(a,b): return mul(add(a,b),.5)
A=(.9,4); B=(0,0); C=(6,0)
a,b,d=.3,.15,.55
P=add(add(mul(A,a),mul(B,b)),mul(C,d))
A1=mul(add(mul(B,b),mul(C,d)),1/(b+d))
B1=mul(add(mul(C,d),mul(A,a)),1/(d+a))
C1=mul(add(mul(A,a),mul(B,b)),1/(a+b))
M=mid(B,C); N=mid(C,A); K=mid(A,B)
X=mid(A,A1); Y=mid(B,B1); Z=mid(C,C1)
G=mul(add(add(A,B),C),1/3)
Q=add(mul(G,1.5),mul(P,-.5))
den=1/a+1/b+1/d
T=mul(add(add(mul(A,1/a),mul(B,1/b)),mul(C,1/d)),1/den)
R=mul(add(add(add(A,B),C),mul(T,-1)),.5)
def fig(kind,base,height=200):
    scale=height/4.7; ox=132; oy=base+12
    def xy(p):return ox+p[0]*scale,oy+p[1]*scale
    def line(p,q,col=ink,width=1.1,dash=False):
        c.setStrokeColor(col);c.setLineWidth(width);c.setDash(3,3) if dash else c.setDash()
        c.line(*xy(p),*xy(q)); c.setDash()
    def dot(p,label,off=(5,4),col=ink):
        xx,yy=xy(p); c.setFillColor(col);c.circle(xx,yy,2.3,fill=1,stroke=0)
        c.setFont('Text',10);c.drawString(xx+off[0],yy+off[1],label.replace('₁','1'))
    for v,w in [(A,B),(B,C),(C,A)]:line(v,w)
    for v,w in [(M,N),(N,K),(K,M)]:line(v,w,gray,.8,True)
    for v,w in [(A,A1),(B,B1),(C,C1)]:line(v,w,gray,.8,True)
    if kind=='a':
        for v in [M,N,K]:line(v,Q,blue,1.8)
        dot(P,'P',(-15,-12));dot(Q,'Q',(6,-12),blue)
    else:
        for v,w in [(M,X),(N,Y),(K,Z)]:line(v,w,blue,1.8)
        for v,s,off in [(X,'X',(3,7)),(Y,'Y',(6,-11)),(Z,'Z',(5,4))]:dot(v,s,off,blue)
        dot(R,'R',(-15,-12),blue);dot(P,'P',(5,0))
    for v,s,off in [(A,'A',(-4,8)),(B,'B',(-14,-7)),(C,'C',(6,-7)),(M,'M',(-4,-16)),(N,'N',(6,0)),(K,'K',(-15,0))]:dot(v,s,off)
    if kind=='b':
        for v,s,off in [(A1,'A₁',(3,-16)),(B1,'B₁',(6,2)),(C1,'C₁',(-20,0))]:dot(v,s,off)
    c.setFont('Text',9);c.setFillColor(gray)
    caption='Рис. 1. Синие прямые пересекаются в Q; серые пунктиры проходят через P.' if kind=='a' else 'Рис. 2. MX, NY и KZ - чевианы треугольника MNK; их общая точка R.'
    c.drawCentredString(W/2,base-20,caption)

title(1,'Краткое решение','Сначала основная идея; подробности и оговорка - на следующих страницах.')
para('<b>Условие.</b> Прямые AP, BP и CP пересекают соответственно BC, CA и AB (или их продолжения) в A<sub>1</sub>, B<sub>1</sub>, C<sub>1</sub>. Пусть M, N, K - середины BC, CA, AB, а X, Y, Z - середины AA<sub>1</sub>, BB<sub>1</sub>, CC<sub>1</sub>.')
para('Нужно доказать: <b>а)</b> прямые через M, N, K, параллельные AP, BP, CP соответственно, имеют общую точку; <b>б)</b> прямые MX, NY, KZ имеют общую точку.')
para('<b>Важная оговорка.</b> Пункт а) верен в общем случае. Пункт б) гарантированно верен при P внутри ABC; в формулировке с продолжениями возможны три параллельные прямые. Контрпример приведён на странице 3.')
section('а) Одна гомотетия')
para('Пусть G - точка пересечения медиан ABC. Гомотетия с центром G и коэффициентом −1/2 переводит A, B, C в M, N, K. Поэтому образы прямых AP, BP, CP - нужные параллельные прямые. Все они проходят через образ Q точки P.')
section('б) Теорема Чевы в срединном треугольнике')
para('Пусть P внутри ABC. Тогда X лежит на NK, Y - на KM, Z - на MN. По подобию соответствующих треугольников и теореме Чевы для ABC:')
para('<b>(NX/XK) · (KY/YM) · (MZ/ZN)<br/>= (CA<sub>1</sub>/A<sub>1</sub>B) · (AB<sub>1</sub>/B<sub>1</sub>C) · (BC<sub>1</sub>/C<sub>1</sub>A) = 1.</b>')
para('По обратной теореме Чевы в треугольнике MNK прямые MX, NY, KZ пересекаются в одной точке.',gap=0)
assert y>260,y
fig('a',70,180)
c.showPage()

title(2,'Подробное решение','Для пункта б) на этой странице предполагается, что P внутри треугольника.')
section('а) Почему подходит коэффициент −1/2')
para('Точка G делит каждую медиану в отношении 2 : 1, считая от вершины. Поэтому A, G, M лежат на одной прямой, GA = 2GM, причём A и M находятся по разные стороны от G. Именно это означает, что гомотетия h с центром G и коэффициентом −1/2 переводит A в M. Аналогично h(B) = N и h(C) = K.')
para('Обозначим h(P) = Q. Гомотетия переводит прямую в параллельную ей прямую (или в неё саму, если она проходит через центр). Значит, образ AP проходит через M и Q и имеет направление AP. Аналогично образы BP и CP проходят через N и Q, K и Q. Таким образом, все три искомые прямые содержат Q. Это рассуждение применимо и к внешней точке P.')
section('б) Почему возникает теорема Чевы')
para('<b>1.</b> Гомотетия с центром A и коэффициентом 1/2 переводит C, B, A<sub>1</sub> в N, K, X соответственно. Поэтому X лежит на NK и <b>NX/XK = CA<sub>1</sub>/A<sub>1</sub>B</b>. Так же, используя центры B и C, получаем Y лежит на KM, Z - на MN и равенства <b>KY/YM = AB<sub>1</sub>/B<sub>1</sub>C</b>, <b>MZ/ZN = BC<sub>1</sub>/C<sub>1</sub>A</b>.')
para('<b>2.</b> Так как AA<sub>1</sub>, BB<sub>1</sub>, CC<sub>1</sub> проходят через P, теорема Чевы даёт:')
para('<b>(BA<sub>1</sub>/A<sub>1</sub>C) · (CB<sub>1</sub>/B<sub>1</sub>A) · (AC<sub>1</sub>/C<sub>1</sub>B) = 1.</b>')
para('<b>3.</b> Произведение отношений из шага 1 обратно этому произведению, а значит, тоже равно 1. В треугольнике MNK точки X, Y, Z лежат на противоположных вершинам M, N, K сторонах. Обратная теорема Чевы даёт общую точку R прямых MX, NY, KZ.')
assert y>258,y
fig('b',65,185)
c.showPage()

title(3,'Оговорка к условию','Контрпример: при внешней точке P пункт б) может быть неверен.')
para('Возьмём <b>A = (0; 0), B = (4; 0), C = (0; 4), P = (8/3; −4/3)</b>. Прямые AP, BP, CP пересекают соответствующие стороны или их продолжения в точках:')
para('<b>A<sub>1</sub> = (8; −4), B<sub>1</sub> = (0; −4), C<sub>1</sub> = (2; 0).</b><br/>Это проверяется подстановкой: AP имеет уравнение y = −x/2, BP - y = x − 4, CP - y = 4 − 2x.')
para('Середины сторон и отрезков имеют координаты:<br/><b>M = (2; 2), N = (0; 2), K = (2; 0);<br/>X = (4; −2), Y = (2; −2), Z = (1; 2).</b>')
para('Следовательно, уравнения искомых прямых таковы:<br/><b>MX: y = −2x + 6;<br/>NY: y = −2x + 2;<br/>KZ: y = −2x + 4.</b>')
para('У всех трёх прямых одинаковый угловой коэффициент −2, но разные свободные члены. Значит, они <b>попарно параллельны и не имеют общей точки</b>.')
para('<b>Как уточнить задачу.</b> Достаточно добавить условие «P лежит внутри треугольника ABC». Для внешних точек в невырожденной конфигурации общее заключение пункта б): прямые пересекаются в одной точке <b>или параллельны</b>. При применении Чевы к продолжениям сторон параллельный случай нельзя исключать без дополнительного условия.')
# Exact counterexample, vector diagram.
ox,oy,s=151,207,31
def xy(p):return ox+p[0]*s,oy+p[1]*s
def ln(p,q,col=ink,w=1,dash=False):
    c.setStrokeColor(col);c.setLineWidth(w);c.setDash(3,3) if dash else c.setDash();c.line(*xy(p),*xy(q));c.setDash()
def pt(p,t,dx=5,dy=4,col=ink):
    xx,yy=xy(p);c.setFillColor(col);c.circle(xx,yy,2.2,fill=1,stroke=0);c.setFont('Text',10);c.drawString(xx+dx,yy+dy,t.replace('₁','1'))
AA=(0,0);BB=(4,0);CC=(0,4);PP=(8/3,-4/3)
for p,q in [(AA,BB),(BB,CC),(CC,AA)]:ln(p,q)
for p,q in [(BB,(8,-4)),(AA,(0,-4)),(AA,(8,-4)),(BB,(0,-4)),(CC,PP)]:ln(p,q,gray,.7,True)
for b0 in [6,2,4]:ln(((b0-3)/2,3),((b0+3)/2,-3),blue,1.7)
for p,t,dx,dy in [(AA,'A',-15,4),(BB,'B',7,3),(CC,'C',-15,4),((8,-4),'A₁',6,-2),((0,-4),'B₁',-21,-5),((2,0),'K = C₁',-8,7),((2,2),'M',6,4),((0,2),'N',-16,0),((4,-2),'X',6,0),((2,-2),'Y',-15,-7),((1,2),'Z',-4,8)]:pt(p,t,dx,dy)
pt(PP,'P',6,2,red)
c.setFillColor(gray);c.setFont('Text',9);c.drawCentredString(W/2,63,'Рис. 3. Синие прямые MX, NY и KZ параллельны; точка P показана красным.')
assert y>345,y
c.save()
print(OUT)
