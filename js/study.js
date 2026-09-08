/* ============================================================
   Personal Study — private spaced repetition (english)
   Ported verbatim from the previous site build; storage keys are
   UNCHANGED (localStorage['study_<subject>_entries']) so existing
   data carries over. Only the markup around it was restyled.
   ============================================================ */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ══════════════════════════════════════════════════════════════
     🔒 PERSONAL STUDY → ENGLISH (비공개 간격 반복 학습)
     ══════════════════════════════════════════════════════════════
     - 모든 데이터는 localStorage['study_<subject>_entries']에만 저장
       (HTML 소스에는 학습 내용이 전혀 없음)
     - 간격 반복(spaced repetition): [1, 2, 3, 7, 15, 30]일
     - 처음부터 multi-subject 구조로 작성 (지금은 'english'만 활성)
     - 핵심 시그니처: getEntries(subject) / saveEntries(subject, list)
                      addEntry(subject, data) / renderStudy(subject)
     ══════════════════════════════════════════════════════════════ */

  // 활성 과목 목록 — 새 과목을 여기 추가하고 탭 라벨만 등록하면 확장됨
  const STUDY_SUBJECTS = ['english'];
  const STUDY_SUBJECT_LABELS = { english: 'English' };
  // 간격 반복 일정 (createdAt 기준 D+N)
  const STUDY_INTERVALS = [1, 2, 3, 7, 15, 30];

  let studyActiveSubject = 'english';
  // All sentences 목록의 검색/필터/정렬 상태
  let studyState = { search: '', filter: 'all', sort: 'newest' };

  // ════════════ 날짜 유틸 (타임존 안전 · 날짜만 YYYY-MM-DD) ════════════
  function studyFormatISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function studyTodayISO() { return studyFormatISO(new Date()); }
  // YYYY-MM-DD → 로컬 자정 Date (UTC 변환으로 인한 하루 밀림 방지)
  function studyParseISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function studyAddDays(iso, n) {
    const d = studyParseISO(iso);
    d.setDate(d.getDate() + n);
    return studyFormatISO(d);
  }

  // ════════════ 저장소 (multi-subject) ════════════
  function studyStorageKey(subject) { return `study_${subject}_entries`; }
  function getEntries(subject) {
    try { return JSON.parse(localStorage.getItem(studyStorageKey(subject)) || '[]'); }
    catch (e) { return []; }
  }
  function saveEntries(subject, list) {
    try {
      localStorage.setItem(studyStorageKey(subject), JSON.stringify(list));
    } catch (e) {
      alert('브라우저 저장 공간이 부족합니다. 일부 항목을 정리하거나 Export로 백업해주세요.');
    }
  }

  // ════════════ 고유 id ════════════
  function studyUid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  // ════════════ 간격 반복 review 6개 생성 ════════════
  function studyMakeReviews(createdAt) {
    return STUDY_INTERVALS.map(day => ({
      day,
      dueDate: studyAddDays(createdAt, day),
      done: false,
      doneAt: null
    }));
  }

  // ════════════ 계산 속성 ════════════
  // reviews 배열은 항상 day 오름차순 → find(!done)이 "가장 빠른 미완료"
  function studyNextReview(e) { return e.reviews.find(r => !r.done) || null; }
  function studyIsMastered(e) { return e.reviews.every(r => r.done); }
  // 상태: mastered / overdue / today / upcoming — '다음 복습'을 기준으로 판정
  function studyStatusOf(e, today) {
    if (studyIsMastered(e)) return 'mastered';
    const n = studyNextReview(e);
    if (n.dueDate < today) return 'overdue';
    if (n.dueDate === today) return 'today';
    return 'upcoming';
  }

  // ════════════ CRUD ════════════
  // 단어장 텍스트("단어 = 뜻", 한 줄에 하나) ↔ 배열 변환 + 정제
  function studyParseVocab(text) {
    return String(text || '').split('\n').map(line => {
      const t = line.trim();
      if (!t) return null;
      // 첫 구분자(= : → 탭 ' - ')에서 단어/뜻 분리, 없으면 단어만
      const m = t.match(/^(.*?)\s*(?:=|:|→|\t|\s-\s)\s*(.*)$/);
      return m ? { term: m[1].trim(), meaning: m[2].trim() } : { term: t, meaning: '' };
    }).filter(v => v && v.term);
  }
  function studyVocabToText(vocab) {
    return (vocab || []).map(v => v.meaning ? `${v.term} = ${v.meaning}` : v.term).join('\n');
  }
  function studySanitizeVocab(v) {
    if (!Array.isArray(v)) return [];
    return v.filter(x => x && typeof x.term === 'string' && x.term.trim())
            .map(x => ({ term: x.term.trim(), meaning: typeof x.meaning === 'string' ? x.meaning.trim() : '' }));
  }
  // sticky source — 마지막으로 입력한 출처를 과목별로 기억해 다음 입력에 재사용
  function studyLastSourceKey(subject) { return `study_${subject}_lastsource`; }

  function addEntry(subject, data) {
    const createdAt = data.createdAt || studyTodayISO();
    const entry = {
      id: studyUid(),
      createdAt,
      sentence: (data.sentence || '').trim(),
      translation: (data.translation || '').trim(),
      source: (data.source || '').trim(),
      vocab: studySanitizeVocab(data.vocab),  // 모르는 단어 뜻 (선택)
      reviews: studyMakeReviews(createdAt)     // 6개 dueDate 자동 계산
    };
    const list = getEntries(subject);
    list.push(entry);
    saveEntries(subject, list);
    return entry;
  }
  function studyUpdateEntry(subject, id, data) {
    const list = getEntries(subject);
    const e = list.find(x => x.id === id);
    if (!e) return;
    // 문장/해석/출처/단어만 수정 — createdAt과 복습 일정(reviews)은 그대로 보존
    e.sentence = (data.sentence || '').trim();
    e.translation = (data.translation || '').trim();
    e.source = (data.source || '').trim();
    e.vocab = studySanitizeVocab(data.vocab);
    saveEntries(subject, list);
  }
  function studyDeleteEntry(subject, id) {
    saveEntries(subject, getEntries(subject).filter(x => x.id !== id));
  }
  // ✓ Mark reviewed — 가장 빠른 미완료 review를 오늘 날짜로 done 처리
  function studyMarkReviewed(subject, id) {
    const list = getEntries(subject);
    const e = list.find(x => x.id === id);
    if (!e) return;
    const next = studyNextReview(e);
    if (!next) return;            // 이미 mastered
    next.done = true;
    next.doneAt = studyTodayISO();  // overdue를 처리해도 "오늘 한 것"으로 인정
    saveEntries(subject, list);
  }

  // ════════════ 출처 렌더 (http로 시작하면 새 탭 링크) ════════════
  function studySourceValue(source) {
    if (/^https?:\/\//i.test(source)) {
      let label = source;
      try { label = new URL(source).hostname.replace(/^www\./, ''); } catch (e) {}
      return `<a href="${escapeHtml(source)}" target="_blank" rel="noopener" class="study-source-link">`
           + `${escapeHtml(label)} <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></a>`;
    }
    return escapeHtml(source);
  }

  // ════════════ 카드 HTML 한 장 ════════════
  // variant: 'review' (Today/Overdue — 큰 카드 + "Day N Review" 배지) | 'list' (All — 일반)
  function studyCardHTML(e, today, variant) {
    const isReview = variant === 'review';
    const status = studyStatusOf(e, today);
    const n = studyNextReview(e);
    const doneCount = e.reviews.filter(r => r.done).length;
    const dots = e.reviews
      .map(r => `<span class="study-dot${r.done ? ' done' : ''}">${r.done ? '●' : '○'}</span>`)
      .join('');

    // 📌 "Day N Review" 큰 배지 — 복습 영역(review variant)에서만, 다음 복습 기준
    let badgeHtml = '';
    if (isReview && n) {
      const od = n.dueDate < today;
      badgeHtml = `
        <div class="study-day-badge${od ? ' overdue' : ''}">
          <span><i class="fa-solid fa-${od ? 'bell' : 'calendar-day'}"></i> Day ${n.day} Review${od ? ' · 밀림' : ''}</span>
          <span class="study-day-sub">${doneCount}/6 완료 · due ${n.dueDate}</span>
        </div>`;
    }

    // 진행/다음 복습 라벨 (카드 하단)
    let progressLabel;
    if (status === 'mastered') {
      progressLabel = '<span class="text-emerald-400">✓ Mastered</span>';
    } else if (isReview) {
      progressLabel = `${doneCount}/6 reviews done`;
    } else {
      const overdueTag = (n.dueDate < today) ? ' <span class="text-red-400">(overdue)</span>' : '';
      progressLabel = `Next: D+${n.day} · due ${n.dueDate}${overdueTag}`;
    }

    // 📖 모르는 단어 뜻 (작게)
    const vocabHtml = (e.vocab && e.vocab.length)
      ? `<div class="study-vocab">${e.vocab.map(v =>
          `<span class="study-vocab-item"><b>${escapeHtml(v.term)}</b>${v.meaning ? escapeHtml(v.meaning) : ''}</span>`).join('')}</div>`
      : '';

    // 해석 (기본 블러)
    const transHtml = e.translation ? `
        <button class="study-reveal-btn" data-action="reveal" aria-label="해석 보기 / 숨기기">
          <i class="fa-solid fa-eye"></i> <span class="study-reveal-label">해석 보기</span>
        </button>
        <div class="study-translation">${escapeHtml(e.translation)}</div>` : '';

    const sourceHtml = e.source
      ? `<div class="study-source"><i class="fa-solid fa-link"></i> Source: ${studySourceValue(e.source)}</div>`
      : '';

    // mastered면 Mark reviewed 버튼 숨김
    const reviewBtn = (status === 'mastered') ? '' :
      `<button class="study-btn primary" data-action="review" aria-label="Mark reviewed — 가장 빠른 미완료 복습 완료">
          <i class="fa-solid fa-check"></i> Mark reviewed</button>`;

    const cardClass = 'study-card'
      + (isReview ? ' review-card' : '')
      + (status === 'overdue' ? ' is-overdue' : '')
      + (status === 'mastered' ? ' is-mastered' : '');

    return `
      <div class="${cardClass}" data-id="${e.id}" tabindex="0">
        ${badgeHtml}
        <p class="study-sentence font-serif">${escapeHtml(e.sentence)}</p>
        ${vocabHtml}
        ${transHtml}
        ${sourceHtml}
        <div class="study-card-foot">
          <div class="study-progress">
            <span class="study-dots" aria-hidden="true">${dots}</span>
            <span>${progressLabel}</span>
          </div>
          <div class="study-card-actions">
            ${reviewBtn}
            <button class="study-btn icon" data-action="edit" aria-label="Edit sentence" title="수정"><i class="fa-solid fa-pen"></i></button>
            <button class="study-btn icon danger" data-action="delete" aria-label="Delete sentence" title="삭제"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </div>`;
  }

  // ════════════ 리스트 채우기 (성능 위해 한 번에 innerHTML) ════════════
  function studyFillList(containerId, list, today, emptyMsg, variant) {
    const c = document.getElementById(containerId);
    if (!c) return;
    if (!list.length) { c.innerHTML = `<div class="study-empty">${escapeHtml(emptyMsg)}</div>`; return; }
    c.innerHTML = list.map(e => studyCardHTML(e, today, variant)).join('');
  }

  // 정렬기
  const studySorters = {
    newest:  (a, b) => b.createdAt.localeCompare(a.createdAt),
    created: (a, b) => a.createdAt.localeCompare(b.createdAt),
    next:    (a, b) => {
      const ad = studyNextReview(a) ? studyNextReview(a).dueDate : '9999-99-99';
      const bd = studyNextReview(b) ? studyNextReview(b).dueDate : '9999-99-99';
      return ad.localeCompare(bd);
    }
  };

  // ════════════ stat 카드 렌더 ════════════
  function studyRenderStats(entries, today) {
    let nToday = 0, nOver = 0, nActive = 0, nMaster = 0;
    entries.forEach(e => {
      const s = studyStatusOf(e, today);
      if (s === 'mastered') nMaster++; else nActive++;
      if (s === 'today') nToday++;
      if (s === 'overdue') nOver++;
    });
    const stats = [
      { key: 'today',    icon: '📅', label: 'Today',    num: nToday,  target: 'studyGroupToday' },
      { key: 'overdue',  icon: '⏰', label: 'Overdue',  num: nOver,   target: 'studyGroupOverdue' },
      { key: 'active',   icon: '📚', label: 'Active',   num: nActive, target: 'studyGroupAll' },
      { key: 'mastered', icon: '✓',  label: 'Mastered', num: nMaster, target: 'studyGroupAll' }
    ];
    document.getElementById('studyStats').innerHTML = stats.map(s => `
        <div class="study-stat ${s.key}" data-scroll-to="${s.target}" role="button" tabindex="0" aria-label="${s.label}: ${s.num}. 클릭하면 해당 목록으로 이동">
          <div class="study-stat-num">${s.num}</div>
          <div class="study-stat-label">${s.icon} ${s.label}</div>
        </div>`).join('');
    // 그룹 헤더의 개수 표기 갱신
    document.querySelector('[data-count="today"]').textContent = `(${nToday})`;
    document.querySelector('[data-count="overdue"]').textContent = `(${nOver})`;
  }

  // ════════════ 메인 렌더 ════════════
  function renderStudy(subject) {
    const today = studyTodayISO();
    const entries = getEntries(subject);

    studyRenderStats(entries, today);

    // 📅 Today — due 날짜순(같은 날이므로 생성순)
    const todayList = entries
      .filter(e => studyStatusOf(e, today) === 'today')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    studyFillList('studyTodayList', todayList, today, '오늘 복습할 문장이 없어요. 잘 따라가고 있네요! 🎉', 'review');

    // ⏰ Overdue — 가장 오래된 미완료부터
    const overdueList = entries
      .filter(e => studyStatusOf(e, today) === 'overdue')
      .sort((a, b) => studyNextReview(a).dueDate.localeCompare(studyNextReview(b).dueDate));
    studyFillList('studyOverdueList', overdueList, today, '놓친 복습이 없어요. 👏', 'review');

    // 📚 All — 검색 + 필터 + 정렬
    let all = entries.slice();
    const q = studyState.search.trim().toLowerCase();
    if (q) {
      all = all.filter(e =>
        (e.sentence + ' ' + e.translation + ' ' + e.source).toLowerCase().includes(q));
    }
    if (studyState.filter === 'active') all = all.filter(e => !studyIsMastered(e));
    else if (studyState.filter === 'mastered') all = all.filter(e => studyIsMastered(e));
    all.sort(studySorters[studyState.sort] || studySorters.newest);

    studyFillList('studyAllList', all, today,
      entries.length === 0 ? '첫 영어 문장을 추가해보세요! ✍️' : '조건에 맞는 문장이 없어요.');
    document.querySelector('[data-count="all"]').textContent = `(${all.length})`;
  }

  // ════════════ 과목 탭 ════════════
  function studyRenderTabs() {
    const tabs = STUDY_SUBJECTS.map(s =>
      `<button class="study-tab${s === studyActiveSubject ? ' active' : ''}" data-subject="${s}">
          <i class="fa-solid fa-language"></i> ${escapeHtml(STUDY_SUBJECT_LABELS[s] || s)}</button>`).join('');
    document.getElementById('studyTabs').innerHTML = tabs +
      `<button class="study-tab study-tab-add" id="studyAddSubject" title="곧 추가됩니다">
          <i class="fa-solid fa-plus"></i> Add subject</button>`;
  }
  function studyOnTabClick(ev) {
    if (ev.target.closest('#studyAddSubject')) {
      alert('다른 과목(수학 등)은 곧 추가됩니다. 지금은 English만 사용할 수 있어요. 🙂');
      return;
    }
    const tab = ev.target.closest('[data-subject]');
    if (!tab) return;
    studyActiveSubject = tab.dataset.subject;
    studyState = { search: '', filter: 'all', sort: 'newest' };
    const search = document.getElementById('studySearch');
    if (search) search.value = '';
    studyRenderTabs();
    renderStudy(studyActiveSubject);
  }

  // ════════════ 입력 폼 토글 / 수정 ════════════
  function studyAutoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  function studyAutoGrowAll() { ['studySentence', 'studyTranslation', 'studyVocab'].forEach(id => studyAutoGrow(document.getElementById(id))); }
  // sticky source — 폼을 새로(추가 모드) 열 때 마지막 출처를 자동 채움
  function studyPrefillSource() {
    const src = document.getElementById('studySource');
    if (!src.value) src.value = localStorage.getItem(studyLastSourceKey(studyActiveSubject)) || '';
  }

  function studyOpenForm(open) {
    const wrap = document.getElementById('studyFormWrap');
    const toggle = document.getElementById('studyAddToggle');
    if (open) {
      wrap.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.innerHTML = '<i class="fa-solid fa-xmark mr-1"></i> Close';
    } else {
      wrap.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '<i class="fa-solid fa-plus mr-1"></i> Add new sentence';
    }
  }
  function studyResetForm() {
    document.getElementById('studyEditId').value = '';
    document.getElementById('studySentence').value = '';
    document.getElementById('studyTranslation').value = '';
    document.getElementById('studyVocab').value = '';
    document.getElementById('studySource').value = '';
    document.getElementById('studySubmitLabel').textContent = 'Add';
    document.getElementById('studyCancelEdit').style.display = 'none';
    document.getElementById('studyAddHint').style.display = '';
    studyAutoGrowAll();
    studyOpenForm(false);
  }
  function studyOpenEdit(id) {
    const e = getEntries(studyActiveSubject).find(x => x.id === id);
    if (!e) return;
    document.getElementById('studyEditId').value = id;
    document.getElementById('studySentence').value = e.sentence;
    document.getElementById('studyTranslation').value = e.translation;
    document.getElementById('studyVocab').value = studyVocabToText(e.vocab);
    document.getElementById('studySource').value = e.source;
    document.getElementById('studySubmitLabel').textContent = 'Save changes';
    document.getElementById('studyCancelEdit').style.display = '';
    document.getElementById('studyAddHint').style.display = 'none';  // 수정 모드엔 "계속 입력" 안내 숨김
    studyOpenForm(true);
    studyAutoGrowAll();
    document.getElementById('studySentence').focus();
    document.getElementById('studyFormWrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function studySubmitHandler() {
    const sentence = document.getElementById('studySentence').value.trim();
    if (!sentence) { alert('영어 문장을 입력해주세요.'); document.getElementById('studySentence').focus(); return; }
    const translation = document.getElementById('studyTranslation').value;
    const source = document.getElementById('studySource').value;
    const vocab = studyParseVocab(document.getElementById('studyVocab').value);
    const editId = document.getElementById('studyEditId').value;
    if (editId) {
      studyUpdateEntry(studyActiveSubject, editId, { sentence, translation, source, vocab });
      studyResetForm();   // 수정은 끝나면 폼 닫기
    } else {
      addEntry(studyActiveSubject, { sentence, translation, source, vocab });
      // sticky source 저장 + 폼은 열어둔 채로 문장/해석/단어만 비워 연속 입력
      localStorage.setItem(studyLastSourceKey(studyActiveSubject), source.trim());
      document.getElementById('studySentence').value = '';
      document.getElementById('studyTranslation').value = '';
      document.getElementById('studyVocab').value = '';
      studyAutoGrowAll();
      document.getElementById('studySentence').focus();
    }
    renderStudy(studyActiveSubject);
  }

  // ════════════ 카드 클릭 위임 (해석 토글 / 복습 / 수정 / 삭제 / 그룹 접기) ════════════
  function studyOnClick(ev) {
    // 그룹 헤더 접기/펴기
    const groupToggle = ev.target.closest('[data-group-toggle]');
    if (groupToggle) {
      document.getElementById(groupToggle.dataset.groupToggle).classList.toggle('collapsed');
      return;
    }
    const actionEl = ev.target.closest('[data-action]');
    const card = ev.target.closest('.study-card');
    if (!actionEl || !card) return;
    const id = card.dataset.id;
    switch (actionEl.dataset.action) {
      case 'reveal': {
        card.classList.toggle('revealed');
        const lbl = card.querySelector('.study-reveal-label');
        if (lbl) lbl.textContent = card.classList.contains('revealed') ? '해석 숨기기' : '해석 보기';
        break;
      }
      case 'review':
        studyMarkReviewed(studyActiveSubject, id);
        renderStudy(studyActiveSubject);
        break;
      case 'edit':
        studyOpenEdit(id);
        break;
      case 'delete':
        if (confirm('이 문장을 삭제할까요?')) {
          studyDeleteEntry(studyActiveSubject, id);
          renderStudy(studyActiveSubject);
        }
        break;
    }
  }

  // ════════════ stat 카드 클릭/키보드 → 해당 목록으로 스크롤 ════════════
  function studyOnStatActivate(ev) {
    const card = ev.target.closest('[data-scroll-to]');
    if (!card) return;
    const t = document.getElementById(card.dataset.scrollTo);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ════════════ 백업: Export / Import JSON ════════════
  function studyExport() {
    const subject = studyActiveSubject;
    const entries = getEntries(subject);
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study_${subject}_export_${studyTodayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  function studyIsValidEntry(e) {
    return e && typeof e === 'object' && typeof e.sentence === 'string' && e.sentence.trim();
  }
  // 가져온 항목을 데이터 모델에 맞게 보정 (누락 필드/잘못된 reviews 복구)
  function studyNormalizeEntry(e) {
    const createdAt = (typeof e.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.createdAt))
      ? e.createdAt : studyTodayISO();
    let reviews = Array.isArray(e.reviews) ? e.reviews : null;
    if (!reviews || reviews.length !== STUDY_INTERVALS.length) {
      reviews = studyMakeReviews(createdAt);
    } else {
      reviews = reviews.map((r, i) => ({
        day: typeof r.day === 'number' ? r.day : STUDY_INTERVALS[i],
        dueDate: (typeof r.dueDate === 'string' && r.dueDate) ? r.dueDate : studyAddDays(createdAt, STUDY_INTERVALS[i]),
        done: !!r.done,
        doneAt: r.doneAt || null
      }));
    }
    return {
      id: e.id || studyUid(),
      createdAt,
      sentence: String(e.sentence).trim(),
      translation: typeof e.translation === 'string' ? e.translation.trim() : '',
      source: typeof e.source === 'string' ? e.source.trim() : '',
      vocab: studySanitizeVocab(e.vocab),
      reviews
    };
  }
  function studyImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const f = input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try { data = JSON.parse(reader.result); }
        catch (e) { alert('JSON 파일을 읽을 수 없습니다.'); return; }
        // 데이터 모델 배열 그대로 또는 { entries: [...] } 형태 모두 허용
        const incoming = Array.isArray(data) ? data : (Array.isArray(data.entries) ? data.entries : null);
        if (!incoming) { alert('올바른 형식이 아닙니다. (문장 배열이 필요합니다)'); return; }
        const valid = incoming.filter(studyIsValidEntry).map(studyNormalizeEntry);
        if (!valid.length) { alert('가져올 유효한 항목이 없습니다.'); return; }
        const overwrite = confirm(
          `${valid.length}개 항목을 가져옵니다.\n\n` +
          `[확인] = 덮어쓰기 (기존 항목 전체 삭제 후 가져온 것으로 교체)\n` +
          `[취소] = 병합 (기존 유지 + 같은 id는 가져온 것 우선)`);
        let merged;
        if (overwrite) {
          merged = valid;
        } else {
          const map = new Map();
          getEntries(studyActiveSubject).forEach(e => map.set(e.id, e));
          valid.forEach(e => map.set(e.id, e));   // id 중복은 가져온 것 우선
          merged = Array.from(map.values());
        }
        saveEntries(studyActiveSubject, merged);
        renderStudy(studyActiveSubject);
        alert('가져오기 완료! ✅');
      };
      reader.readAsText(f);
    };
    input.click();
  }

  // ════════════ 초기화 ════════════
  function studyInit() {
    const section = document.getElementById('study');
    if (!section) return;   // 안전장치

    studyRenderTabs();

    // 폼 토글 / 제출 / 취소
    document.getElementById('studyAddToggle').addEventListener('click', () => {
      const wrap = document.getElementById('studyFormWrap');
      if (wrap.classList.contains('open')) studyResetForm();
      else { studyOpenForm(true); studyPrefillSource(); studyAutoGrowAll(); document.getElementById('studySentence').focus(); }
    });
    document.getElementById('studySubmit').addEventListener('click', studySubmitHandler);
    document.getElementById('studyCancelEdit').addEventListener('click', studyResetForm);

    // textarea 자동 높이
    ['studySentence', 'studyTranslation', 'studyVocab'].forEach(id =>
      document.getElementById(id).addEventListener('input', e => studyAutoGrow(e.target)));

    // 검색 / 필터 / 정렬
    document.getElementById('studySearch').addEventListener('input', e => { studyState.search = e.target.value; renderStudy(studyActiveSubject); });
    document.getElementById('studyFilter').addEventListener('change', e => { studyState.filter = e.target.value; renderStudy(studyActiveSubject); });
    document.getElementById('studySort').addEventListener('change', e => { studyState.sort = e.target.value; renderStudy(studyActiveSubject); });

    // 백업
    document.getElementById('studyExport').addEventListener('click', studyExport);
    document.getElementById('studyImport').addEventListener('click', studyImport);

    // 카드 클릭(이벤트 위임) + 더블클릭 수정
    section.addEventListener('click', studyOnClick);
    section.addEventListener('dblclick', ev => {
      const card = ev.target.closest('.study-card');
      if (card) studyOpenEdit(card.dataset.id);
    });

    // 과목 탭
    document.getElementById('studyTabs').addEventListener('click', studyOnTabClick);

    // stat 카드 클릭/키보드(Enter·Space) → 스크롤
    const stats = document.getElementById('studyStats');
    stats.addEventListener('click', studyOnStatActivate);
    stats.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); studyOnStatActivate(ev); }
    });

    renderStudy(studyActiveSubject);
  }
  studyInit();
})();
