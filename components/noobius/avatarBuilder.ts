import * as T from 'three';
type Mesh = (
  g: T.BufferGeometry,
  m: T.Material,
  parent: T.Object3D,
  x?: number,
  y?: number,
  z?: number,
) => T.Mesh;
type Box = (
  w: number,
  h: number,
  d: number,
  m: T.Material,
  parent: T.Object3D,
  x?: number,
  y?: number,
  z?: number,
) => T.Mesh;
type Sphere = (
  r: number,
  m: T.Material,
  parent: T.Object3D,
  x?: number,
  y?: number,
  z?: number,
) => T.Mesh;
export function avatarBuilder({
  mesh,
  box,
  sphere,
  skin,
  eyeBag,
  browMat,
  padding,
  white,
  black,
  steel,
  amber,
  dark,
}: {
  mesh: Mesh;
  box: Box;
  sphere: Sphere;
  skin: T.Material;
  eyeBag: T.Material;
  browMat: T.Material;
  padding: T.Material;
  white: T.Material;
  black: T.Material;
  steel: T.Material;
  amber: T.Material;
  dark: T.Material;
}) {
  function makeAvatar(color: T.Material) {
    const g = new T.Group(),
      body = new T.Group();
    g.add(body);
    const lathe = (points: number[][], m: T.Material) => {
      const curve = new T.CatmullRomCurve3(
        points.map(([r, y]) => new T.Vector3(r, y, 0)),
      );
      const geo = new T.LatheGeometry(
        curve.getPoints(48).map((p) => new T.Vector2(Math.max(0, p.x), p.y)),
        40,
      );
      const shape = mesh(geo, m, body);
      shape.scale.z = 0.82;
      return shape;
    };
    // Continuous broad bean silhouette, with a loose shirt over its lower half.
    lathe(
      [
        [0, 0.53],
        [0.41, 0.62],
        [0.52, 0.88],
        [0.555, 1.22],
        [0.51, 1.55],
        [0.42, 1.83],
        [0.25, 2.01],
        [0, 2.075],
      ],
      skin,
    );
    lathe(
      [
        [0, 0.34],
        [0.48, 0.35],
        [0.59, 0.42],
        [0.6, 0.65],
        [0.59, 0.86],
        [0.54, 1.01],
        [0.5, 1.055],
      ],
      color,
    );
    const collar = mesh(
      new T.TorusGeometry(0.5, 0.026, 8, 36),
      color,
      body,
      0,
      1.055,
      0,
    );
    collar.rotation.x = Math.PI / 2;
    collar.scale.y = 0.82;
    const feet: T.Object3D[] = [],
      arms: T.Object3D[] = [];
    for (const side of [-1, 1]) {
      const arm = new T.Group();
      arm.position.set(side * 0.56, 0.88, 0);
      body.add(arm);
      const sleeve = mesh(
        new T.CapsuleGeometry(0.16, 0.13, 5, 14),
        color,
        arm,
        side * 0.04,
        -0.015,
        0,
      );
      sleeve.rotation.z = side * 0.18;
      mesh(
        new T.CapsuleGeometry(0.105, 0.24, 5, 14),
        skin,
        arm,
        side * 0.075,
        -0.27,
        0.015,
      );
      const hand = sphere(0.115, skin, arm, side * 0.075, -0.45, 0.03);
      hand.scale.y = 1.15;
      arms.push(arm);
      const foot = new T.Group();
      g.add(foot);
      foot.position.set(side * 0.235, 0.12, 0);
      mesh(new T.CapsuleGeometry(0.12, 0.17, 4, 12), skin, foot, 0, 0.13, 0);
      const shoe = sphere(0.17, padding, foot, 0, 0, 0.055);
      shoe.scale.set(0.83, 0.58, 1.24);
      feet.push(foot);
    }
    for (const eye of [
      { x: -0.225, y: 1.585, r: 0.245 },
      { x: 0.25, y: 1.535, r: 0.205 },
    ]) {
      const bag = sphere(
        eye.r * 1.08,
        eyeBag,
        body,
        eye.x,
        eye.y - 0.026,
        0.363,
      );
      bag.scale.set(1, 1.12, 0.36);
      const whiteEye = sphere(eye.r, white, body, eye.x, eye.y, 0.407);
      whiteEye.scale.set(0.97, 1.11, 0.63);
      const pupil = sphere(
        eye.r * 0.32,
        padding,
        body,
        eye.x + 0.008,
        eye.y - 0.025,
        0.407 + eye.r * 0.615,
      );
      pupil.scale.z = 0.53;
      sphere(
        eye.r * 0.07,
        white,
        body,
        eye.x - 0.014,
        eye.y + 0.007,
        0.415 + eye.r * 0.8,
      );
    }
    const arc = (points: number[][], radius: number, m: T.Material) =>
      mesh(
        new T.TubeGeometry(
          new T.CatmullRomCurve3(
            points.map(
              (p) => new T.Vector3(...(p as [number, number, number])),
            ),
          ),
          24,
          radius,
          10,
          false,
        ),
        m,
        body,
      );
    arc(
      [
        [-0.45, 1.88, 0.29],
        [-0.31, 1.935, 0.34],
        [-0.12, 1.98, 0.33],
      ],
      0.052,
      browMat,
    );
    arc(
      [
        [0.12, 1.94, 0.34],
        [0.28, 1.865, 0.35],
        [0.43, 1.82, 0.31],
      ],
      0.05,
      browMat,
    );
    const mouthShape = new T.Shape();
    mouthShape.moveTo(-0.14, 0);
    mouthShape.bezierCurveTo(-0.09, 0.09, 0.085, 0.095, 0.15, -0.01);
    mouthShape.quadraticCurveTo(0.14, -0.045, 0.045, -0.025);
    mouthShape.quadraticCurveTo(-0.065, -0.02, -0.14, -0.035);
    mouthShape.closePath();
    mesh(new T.ShapeGeometry(mouthShape, 24), padding, body, 0, 1.22, 0.473);
    box(0.047, 0.027, 0.018, white, body, -0.024, 1.272, 0.488);
    box(0.043, 0.025, 0.018, white, body, 0.025, 1.273, 0.488);
    for (const side of [-1, 1]) {
      const cushion = sphere(0.205, padding, body, side * 0.55, 1.62, -0.012);
      cushion.scale.set(0.37, 1.23, 0.77);
      const shell = sphere(0.18, black, body, side * 0.605, 1.62, -0.012);
      shell.scale.set(0.3, 1.23, 0.82);
    }
    const band = mesh(
      new T.TorusGeometry(0.615, 0.043, 10, 40, Math.PI),
      black,
      body,
      0,
      1.67,
      -0.035,
    );
    band.scale.y = 1.1;
    const bandTop = mesh(
      new T.TorusGeometry(0.625, 0.018, 8, 40, Math.PI),
      steel,
      body,
      0,
      1.68,
      -0.03,
    );
    bandTop.scale.y = 1.1;
    arc(
      [
        [0.62, 1.5, 0.06],
        [0.69, 1.36, 0.26],
        [0.65, 1.22, 0.48],
        [0.56, 1.18, 0.56],
      ],
      0.016,
      steel,
    );
    const mic = sphere(0.067, padding, body, 0.55, 1.18, 0.56);
    mic.scale.y = 1.2;
    g.userData.arms = arms;
    g.userData.feet = feet;
    return { g, body };
  }
  function addAccessories(parent: T.Group) {
    const root = new T.Group();
    parent.add(root);
    const cap = new T.Group();
    root.add(cap);
    const top = sphere(0.4, steel, cap, 0, 2.04, 0);
    top.scale.set(1, 0.4, 1);
    box(0.52, 0.045, 0.3, steel, cap, 0, 2.02, 0.31);
    const pack = new T.Group();
    root.add(pack);
    box(0.62, 0.68, 0.28, amber, pack, 0, 0.86, -0.49);
    box(0.4, 0.3, 0.08, dark, pack, 0, 0.76, -0.66);
    const beacon = new T.Group();
    root.add(beacon);
    box(0.2, 0.1, 0.2, black, beacon, 0, 2.21, 0);
    sphere(0.1, amber, beacon, 0, 2.32, 0);
    const apply = (id: string) => {
      cap.visible = id === 'cap';
      pack.visible = id === 'pack';
      beacon.visible = id === 'beacon';
    };
    apply('none');
    return apply;
  }

  return { makeAvatar, addAccessories };
}
