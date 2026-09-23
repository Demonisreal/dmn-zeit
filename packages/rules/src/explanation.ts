// the ui turns key and params into text, the rules never produce wording themselves
export type Explanation = {
	key: string;
	params: Readonly<Record<string, string | number>>;
};
