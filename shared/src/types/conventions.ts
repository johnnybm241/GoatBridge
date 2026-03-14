export interface ConventionCardData {
  generalApproach: string;
  ntRange: { lo: number; hi: number };
  stayman: boolean;
  transfers: boolean;
  twoClubStrong: boolean;
  weakTwos: boolean;
  blackwood: boolean;
  gerber: boolean;
  negativeDoubles: boolean;
  majorSystem: string;
  minorSystem: string;
  defensiveSignals: string;
  leadConventions: string;
  otherNotes: string;
}

export const DEFAULT_CONVENTION_CARD: ConventionCardData = {
  generalApproach: 'Standard American, 5-card majors',
  ntRange: { lo: 15, hi: 17 },
  stayman: true,
  transfers: true,
  twoClubStrong: true,
  weakTwos: true,
  blackwood: true,
  gerber: false,
  negativeDoubles: true,
  majorSystem: '5-card majors, limit raises',
  minorSystem: 'May open short club',
  defensiveSignals: 'Standard: hi=like, lo=dislike',
  leadConventions: '4th best vs NT, top of sequence',
  otherNotes: '',
};
