/**
 * returns true if all values in the array are the same
 * @param {*} arr array
 */
export const allEqual = (arr: any[]) => arr.every((v) => v === arr[0]);

/**
 * shuffles an array
 * @param a array
 * @returns
 */
export function shuffle(a: any[]) {
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}
