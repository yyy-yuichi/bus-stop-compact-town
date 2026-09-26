export function localDisposition(r, policy) {
  if (r.group === 'harete_graduate') return {decision:'hold_relocated',route:'historical_relocated',reason:'移転先の店舗位置・日付を確認するまで旧施設へ登録しない。'};
  if (r.group === 'market_current') {
    if (r.directory_sources.includes(policy.market.offsite_directory)) return {decision:'hold_offsite',route:'conflict_or_unclear',reason:policy.market.offsite_reason};
    if (policy.market.outside_retail_scope.includes(r.id)) return {decision:'outside_scope',route:'outside_current_scope',reason:'包材・道具またはたばこ中心。食品店へ誤分類しない。'};
    if (policy.market.suspended[r.id]) return {decision:'hold_suspended',route:'conflict_or_unclear',reason:policy.market.suspended[r.id]};
    if (policy.market.aggregate[r.id]) return {decision:'aggregate_source',route:'duplicate_directory_entry',target:policy.market.aggregate[r.id],reason:policy.market.aggregate_reason};
    return {decision:'add_current_listing',route:'new_current_listing',category:policy.market.restaurant_ids.includes(r.id)?'restaurant':'food_shop',reason:policy.market.identity_note};
  }
  if (r.group === 'harete_current') {
    if (policy.harete.existing[r.id]) return {decision:'already_present',route:'existing_identity',target:policy.harete.existing[r.id],reason:'前段で掲載済み。再追加・既存店舗位置の変更なし。'};
    const date=policy.harete.opening_dates[r.id];
    return {decision:date?'add_opening':'add_current_listing',route:'new_current_listing',category:policy.harete.categories[r.id],date:date??null,reason:policy.harete.notes[r.id]??policy.harete.planned_only[r.id]??'現行の店舗別タイトル・本文・公式ナビを確認。旧URL名を店舗名に使わない。'};
  }
  throw Error('Unknown local directory group');
}
