export interface AmPolicyDecision {
  resource: string;
  actions: { [ action: string ]: boolean; };
  attributes: { [ attribute: string ]: string[]; };
  advices: any;
}
