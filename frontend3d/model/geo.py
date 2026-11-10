import math
import numpy as np
# ---------------------------------------------------------------- geometrie
def hexrgb(h, a=1.0):
    h = h.lstrip("#"); return [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)] + [a]

def part(p, n, uv, idx):
    P = np.asarray(p, np.float32); N = np.asarray(n, np.float32)
    T = np.asarray(idx, np.uint32).reshape(-1, 3).copy()
    # winding automatisch gelijk trekken met de normalen (CCW = buitenkant)
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    flip = np.einsum("ij,ij->i", fn, N[T].mean(1)) < 0
    T[flip] = T[flip][:, [0, 2, 1]]
    return [P, N, np.asarray(uv, np.float32), T.reshape(-1)]

def box(c, s):
    c = np.array(c, float); s = np.array(s, float) / 2
    P, N, U, I = [], [], [], []
    for ax in range(3):
        for sg in (-1, 1):
            n = np.zeros(3); n[ax] = sg
            u_ax, v_ax = [a for a in range(3) if a != ax]
            if sg < 0: u_ax, v_ax = v_ax, u_ax
            base = len(P)
            for du, dv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                p = n * s.copy(); p[ax] = sg * s[ax]
                p[u_ax] = du * s[u_ax]; p[v_ax] = dv * s[v_ax]
                P.append(c + p); N.append(n); U.append(((du + 1) / 2, (1 - dv) / 2))
            I += [base, base + 1, base + 2, base, base + 2, base + 3]
    return part(P, N, U, I)

def _frame(d):
    d = d / np.linalg.norm(d)
    a = np.array([1, 0, 0]) if abs(d[0]) < 0.9 else np.array([0, 1, 0])
    u = np.cross(d, a); u /= np.linalg.norm(u); v = np.cross(d, u)
    return d, u, v

def cyl(p0, p1, r, seg=24, caps=True):
    p0, p1 = np.array(p0, float), np.array(p1, float)
    d, u, v = _frame(p1 - p0)
    P, N, U, I = [], [], [], []
    for i in range(seg + 1):
        t = 2 * math.pi * i / seg; rad = math.cos(t) * u + math.sin(t) * v
        P += [p0 + r * rad, p1 + r * rad]; N += [rad, rad]; U += [(i / seg, 1), (i / seg, 0)]
    for i in range(seg):
        a = 2 * i; I += [a, a + 2, a + 1, a + 1, a + 2, a + 3]
    if caps:
        for pc, nn in ((p0, -d), (p1, d)):
            ci = len(P); P.append(pc); N.append(nn); U.append((.5, .5))
            for i in range(seg + 1):
                t = 2 * math.pi * i / seg
                P.append(pc + r * (math.cos(t) * u + math.sin(t) * v)); N.append(nn)
                U.append((.5 + .5 * math.cos(t), .5 + .5 * math.sin(t)))
            for i in range(seg):
                a, b = ci + 1 + i, ci + 2 + i
                I += [ci, b, a] if nn is d or np.dot(nn, d) > 0 else [ci, a, b]
    return part(P, N, U, I)

def sphere(c, r, seg=10):
    c = np.array(c, float); P, N, U, I = [], [], [], []
    for i in range(seg + 1):
        th = math.pi * i / seg
        for j in range(seg * 2 + 1):
            ph = 2 * math.pi * j / (seg * 2)
            n = np.array([math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)])
            P.append(c + r * n); N.append(n); U.append((j / (seg * 2), i / seg))
    w = seg * 2 + 1
    for i in range(seg):
        for j in range(seg * 2):
            a = i * w + j; I += [a, a + 1, a + w, a + 1, a + w + 1, a + w]
    return part(P, N, U, I)

def tube(pts, r, seg=12):
    pts = [np.array(p, float) for p in pts]; out = []
    for a, b in zip(pts, pts[1:]):
        if np.linalg.norm(b - a) > 1e-6: out.append(cyl(a, b, r, seg, caps=False))
    # alleen bolletjes op echte knikken (scheelt veel vertices bij spiralen)
    for k in range(1, len(pts) - 1):
        a, b = pts[k] - pts[k - 1], pts[k + 1] - pts[k]
        na, nb = np.linalg.norm(a), np.linalg.norm(b)
        if na > 1e-6 and nb > 1e-6 and np.dot(a, b) / (na * nb) < 0.97:
            out.append(sphere(pts[k], r, 4))
    return out

def quad(c, w, h, normal=(0, 0, 1), up=(0, 1, 0), flip_v=False):
    c = np.array(c, float); n = np.array(normal, float); n /= np.linalg.norm(n)
    upv = np.array(up, float); right = np.cross(upv, n); right /= np.linalg.norm(right)
    upv = np.cross(n, right)
    P = [c - right * w / 2 + upv * h / 2, c + right * w / 2 + upv * h / 2,
         c + right * w / 2 - upv * h / 2, c - right * w / 2 - upv * h / 2]
    U = [(0, 0), (1, 0), (1, 1), (0, 1)]          # glTF: v=0 is bovenkant
    if flip_v: U = [(u, 1 - v) for u, v in U]
    return part(P, [n] * 4, U, [0, 2, 1, 0, 3, 2])

def rotate(pt, axis, ang):
    """roteer een part rond as (door oorsprong) – in-place kopie"""
    axis = np.array(axis, float); axis /= np.linalg.norm(axis)
    K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    R = np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K
    return [pt[0] @ R.T.astype(np.float32), pt[1] @ R.T.astype(np.float32), pt[2], pt[3]]

def shift(pt, t): return [pt[0] + np.array(t, np.float32), pt[1], pt[2], pt[3]]

