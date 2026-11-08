/** Base UI also accepts a function for `className`; the wrappers take a string so `cn` can merge it. */
export type WithClassName<Props> = Omit<Props, 'className'> & { className?: string };
