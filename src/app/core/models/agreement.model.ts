export interface AgreementClause {
  heading: string;
  body: string;
}

export interface AgreementTemplate {
  title: string;
  /** Bump whenever any wording below changes, so a saved record can be
   *  traced back to the exact revision the client signed. */
  version: string;
  provider: string;
  clauses: AgreementClause[];
  acknowledgement: string;
}
