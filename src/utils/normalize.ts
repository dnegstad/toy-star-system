export const normalize = (value: number, units: string = 'px') => {
    return value ? `${value}${units}` : `${value}`;
}