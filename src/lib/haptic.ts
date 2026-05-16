const canVibrate = () =>
  typeof navigator !== "undefined" && "vibrate" in navigator;

export const haptic = {
  success: () => canVibrate() && navigator.vibrate(40),
  error: () => canVibrate() && navigator.vibrate([100, 50, 100]),
  light: () => canVibrate() && navigator.vibrate(15),
};
