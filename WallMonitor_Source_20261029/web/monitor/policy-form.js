export function policyInput(entries, savedPolicy) {
  const values=Object.fromEntries([...entries].map(([key,value])=>[key,Number(value)]));
  return {...values,basis:savedPolicy.basis,confirmed:savedPolicy.confirmed,
    emptyAtStart:savedPolicy.emptyAtStart,jointReference:'actual'};
}
