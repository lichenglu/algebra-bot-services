import { BoxedExpression } from '@cortex-js/compute-engine';
import { isArray, isNumber, isString } from 'mathjs';
import { rando } from '@nastyox/rando.js';

export const getStaticImageURL = (name: string) => {
  return `${process.env.BASE_URL}/imgs/${name}`;
};

export function modifyExpression(
  arr: any,
  modifiedNum = 0,
  maxTurns = 3,
): any[] {
  let latestAction = '';

  const acceptableOperation = {
    Divide: true,
    Multiply: true,
    Add: true,
    Subtract: true,
    Equal: true,
    Power: true,
  };

  if (!isArray(arr)) {
    throw new Error('Expression not an array');
  }

  return arr.map((elm) => {
    if (isString(elm) && acceptableOperation[elm]) {
      latestAction = elm;
      if (['Add', 'Subtract', 'Mutilply', 'Divide'].includes(elm)) {
        if (modifiedNum < maxTurns && rando(1) > 0.5) {
            if (elm === 'Add') {
              elm = 'Subtract'
            } else if (elm === 'Subtract') {
              elm = 'Add'
            } else if (elm === 'Mutilply') {
              elm = 'Divide'
            } else if (elm === 'Divide') {
              elm = 'Multiply'
            }
            modifiedNum++
            return elm
        }
      }
    }

    if (latestAction && isNumber(elm)) {
      if (modifiedNum < maxTurns && rando(1) > 0.5) {
        const copiedElm = elm
        
        if (elm % 2 === 0) {
            elm = elm / 2
        } else {
            elm = elm + rando(-1, 1)
        }

        if (elm === 0 || elm === 1 || elm === -1) {
            elm = copiedElm
            return elm
        }

        modifiedNum++;

        return elm
      }
    }

    if (isArray(elm)) {
      return modifyExpression(elm, modifiedNum);
    }

    return elm;
  });
}

export const normalizeLatexExpression = (expression: string) => {
    return expression
        .replace(/±/g, '\\pm') // normalize plus/minus sign
        .replace(/\\\//g, '/') // normalize plus/minus sign
        .replace(/--/g, '-') // normalize plus/minus sign
        .replace(/\+\+/g, '+') // normalize plus/minus sign
}