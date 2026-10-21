import styles from "./DeliveryGame.module.css";

const R = 30, C = 2 * Math.PI * R;

/** Fills as the house gets closer; green (and the star lit) when a jump throws the parcel. */
export function DeliveryThrowRing({ fill, phase, perfect, text }: { fill: number; phase: "warn" | "window"; perfect: boolean; text: string }) {
  return (
    <div className={styles.throwRing} data-phase={phase} data-perfect={perfect} role="status" aria-label={text}>
      <svg viewBox="0 0 76 76" aria-hidden="true">
        <circle className={styles.track} cx="38" cy="38" r="35" />
        <circle className={styles.bar} cx="38" cy="38" r={R} strokeDasharray={`${C * fill} ${C}`} />
        <path className={styles.star} d="M38 24l4.4 9 9.9 1.4-7.2 7 1.7 9.8L38 46.4l-8.8 4.8 1.7-9.8-7.2-7 9.9-1.4z" />
      </svg>
      <span>{text}</span>
    </div>
  );
}
