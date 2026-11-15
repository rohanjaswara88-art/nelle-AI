// Nelle's silhouette: a profile bust facing left, drawn as separate parts so each can move.
// Design space is 600 x 820. Angles are degrees; positive arm angles swing the arm forward.

export const FIGURE = { width: 600, height: 820, centerX: 320 };

const PIVOT = {
  neck: [330, 350],
  jaw: [322, 292],
  shoulder: [408, 500],
  elbow: [402, 692],
  wrist: [402, 862],
};

const PATHS = {
  torso: new Path2D(
    "M276,326 C279,362 284,400 288,428 C276,452 246,472 224,500 C206,526 196,566 194,616 " +
      "C192,690 194,750 198,820 L496,820 C498,740 496,666 488,612 C478,552 462,510 432,484 " +
      "C408,464 388,442 380,414 C374,392 368,362 366,326 Z"
  ),
  head: new Path2D(
    "M372,352 C404,340 426,300 428,252 C430,196 404,146 356,124 C322,110 280,112 256,128 " +
      "C238,142 230,158 230,176 C228,192 227,204 230,216 C230,224 226,232 222,240 " +
      "C218,248 213,256 210,264 C208,269 211,273 217,275 C221,276 224,278 225,282 " +
      "C224,288 222,293 224,297 C226,301 230,303 234,305 L300,312 L330,360 Z"
  ),
  jaw: new Path2D(
    "M234,305 C229,308 228,315 232,320 C235,323 238,325 238,328 C233,334 233,348 244,355 " +
      "C262,365 296,364 322,352 L338,320 L320,296 L290,300 Z"
  ),
  upperArm: new Path2D(
    "M378,492 C372,560 370,630 374,690 C376,706 388,712 400,712 C414,712 428,706 430,690 " +
      "C434,630 438,560 438,492 C438,470 378,470 378,492 Z"
  ),
  forearm: new Path2D("M376,690 C374,750 378,810 384,862 L420,862 C426,810 430,750 428,690 Z"),
  hand: new Path2D(
    "M384,858 C376,880 374,906 380,928 C384,944 392,956 400,960 C408,962 414,956 416,946 " +
      "C420,930 422,904 420,880 L420,858 Z M386,872 C374,882 368,898 372,908 C376,912 382,904 386,894 Z"
  ),
};

const RAD = Math.PI / 180;
const HEAD_SCALE = 0.88; // a smaller head on a longer neck reads as more graceful
const HEAD_RAISE = -24;

function rotateAround(ctx, [x, y], degrees) {
  ctx.translate(x, y);
  ctx.rotate(degrees * RAD);
  ctx.translate(-x, -y);
}

/**
 * Draw the figure in design space. `pose` fields:
 * bodyX, slump (px), breath (-1..1), headX, headY (px), pitch (deg, + looks down),
 * jaw (deg, + opens), upper, fore, wrist (deg).
 */
export function drawFigure(ctx, pose) {
  const lift = -pose.breath * 2.2;
  ctx.save();
  ctx.translate(pose.bodyX, pose.slump);

  ctx.save();
  ctx.translate(350, 820);
  ctx.scale(1 + pose.breath * 0.0025, 1 + pose.breath * 0.005);
  ctx.translate(-350, -820);
  ctx.fill(PATHS.torso);
  ctx.restore();

  ctx.save();
  ctx.translate(0, lift);
  rotateAround(ctx, PIVOT.shoulder, pose.upper);
  ctx.fill(PATHS.upperArm);
  rotateAround(ctx, PIVOT.elbow, pose.fore);
  ctx.fill(PATHS.forearm);
  rotateAround(ctx, PIVOT.wrist, pose.wrist);
  ctx.fill(PATHS.hand);
  ctx.restore();

  ctx.save();
  ctx.translate(pose.headX, lift * 1.2 + pose.headY + HEAD_RAISE);
  rotateAround(ctx, PIVOT.neck, -pose.pitch);
  ctx.translate(PIVOT.neck[0], PIVOT.neck[1]);
  ctx.scale(HEAD_SCALE, HEAD_SCALE);
  ctx.translate(-PIVOT.neck[0], -PIVOT.neck[1]);
  ctx.fill(PATHS.head);
  rotateAround(ctx, PIVOT.jaw, -pose.jaw);
  ctx.fill(PATHS.jaw);
  ctx.restore();

  ctx.restore();
}

/** Approximate design-space points the HUD hangs its labels and markers on. */
export function anchorPoints(pose) {
  const lift = -pose.breath * 2.2;
  const hx = pose.bodyX + pose.headX;
  const hy = pose.slump + lift * 1.2 + pose.headY + HEAD_RAISE;
  const by = pose.slump + lift;
  // forward kinematics for the hand
  const a1 = pose.upper * RAD;
  const a2 = (pose.upper + pose.fore) * RAD;
  const elbow = [PIVOT.shoulder[0] - 192 * Math.sin(a1), PIVOT.shoulder[1] + 192 * Math.cos(a1)];
  const wrist = [elbow[0] - 170 * Math.sin(a2), elbow[1] + 170 * Math.cos(a2)];
  return {
    crown: [372 + hx, 160 + hy],
    brow: [240 + hx, 218 + hy],
    temple: [318 + hx, 242 + hy],
    throat: [262 + pose.bodyX, 400 + by],
    shoulder: [446 + pose.bodyX, 486 + by],
    chest: [262 + pose.bodyX, 560 + by],
    hand: [wrist[0] + pose.bodyX, wrist[1] + by],
  };
}
