import { describe, expect, it } from 'vitest';
import { getDisplayAccountName } from '../../utils/displayNames';

describe('display account names', () => {
  it('translates partner group and child accounts to english by equity codes', () => {
    const partnersCapitalGroup = getDisplayAccountName(
      { id: 'acc_grp_cap', code: '331', name: 'رأس مال الشركاء' },
      true
    );
    expect(partnersCapitalGroup).toBe('Partners Capital');

    const partnerCapital = getDisplayAccountName(
      { id: 'acc_cap_p1', code: '331236896', name: 'رأس مال أحمد' },
      true
    );
    expect(partnerCapital).toMatch(/Capital$/);
    expect(partnerCapital).not.toContain('رأس');
    expect(partnerCapital).not.toContain('أحمد');

    const partnerCurrent = getDisplayAccountName(
      { id: 'acc_cur_p1', code: '332236896', name: 'جاري أحمد' },
      true
    );
    expect(partnerCurrent).toMatch(/Current$/);
    expect(partnerCurrent).not.toContain('جاري');

    const partnerDrawings = getDisplayAccountName(
      { id: 'acc_draw_p1', code: '333236896', name: 'مسحوبات أحمد' },
      true
    );
    expect(partnerDrawings).toMatch(/Drawings$/);
    expect(partnerDrawings).not.toContain('مسحوبات');
  });

  it('keeps source name when app language is arabic', () => {
    const source = { id: 'acc_cap_p2', code: '3319999', name: 'رأس مال بلال' };
    expect(getDisplayAccountName(source, false)).toBe(source.name);
  });
});
