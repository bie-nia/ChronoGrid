import { useNavigate } from 'react-router-dom'
import {
  LuMousePointerClick,
  LuLayoutGrid,
  LuUndo2,
  LuPalette,
  LuUsers,
  LuFileDown,
} from 'react-icons/lu'
import { ChronoGridLogo } from './ChronoGridLogo'

// ── Dane ────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    Icon: LuMousePointerClick,
    title: 'Dodawanie eventów w dwa kliknięcia',
    desc: 'Kliknij na dowolny slot w kalendarzu, wpisz nazwę i gotowe. Drag & drop żeby przesunąć, przeciągnij krawędź żeby zmienić czas — zero zbędnych okienek.',
  },
  {
    Icon: LuLayoutGrid,
    title: 'Matryca Eisenhowera',
    desc: 'Pilne vs. ważne. Przeciągaj zadania między kwadrantami i zamieniaj je w bloki czasowe w kalendarzu.',
  },
  {
    Icon: LuPalette,
    title: 'Szablony aktywności',
    desc: 'Utwórz raz szablon "Siłownia" z kolorem i ikoną, przeciągaj go na dowolny dzień tygodnia.',
  },
  {
    Icon: LuUsers,
    title: 'Kontakty i urodziny',
    desc: 'Baza kontaktów z notatkami i zainteresowaniami, chroniona PINem. Urodziny pojawiają się automatycznie w kalendarzu.',
  },
  {
    Icon: LuFileDown,
    title: 'Eksport i import .ics',
    desc: 'Synchronizuj z Google Calendar, Apple Calendar lub dowolną inną aplikacją przez standard iCalendar.',
  },
  {
    Icon: LuUndo2,
    title: 'Ctrl+Z zawsze pod ręką',
    desc: 'Przypadkowo przesunąłeś event? Ctrl+Z cofa do 20 ostatnich akcji — bez stresu.',
  },
]

const FAQ = [
  {
    q: 'Czy ChronoGrid jest darmowy?',
    a: 'Tak, w 100%. Żadnych planów premium, żadnych limitów po 14 dniach. ChronoGrid jest open-source — kod znajdziesz na GitHub (bie-nia/ChronoGrid), możesz postawić własną instancję albo korzystać z gotowego demo.',
  },
  {
    q: 'Dla kogo jest ta aplikacja?',
    a: 'Dla każdego, komu standardowe kalendarze wydają się zbyt skomplikowane albo zbyt nudne, żeby w ogóle ich używać. Szczególnie dla osób z ADHD — interfejs jest celowo prosty, bez powiadomień i bez poczucia winy za niewykonane zadania.',
  },
  {
    q: 'Czy moje dane są bezpieczne?',
    a: 'Hasła trzymamy zahashowane (bcrypt), sesje wygasają automatycznie, a połączenie idzie przez HTTPS. Jeśli zależy ci na pełnej kontroli — możesz postawić własny backend w kilka minut i dane nigdy nie opuszczą twojego serwera.',
  },
  {
    q: 'Czy działa na telefonie?',
    a: 'Interfejs jest w pełni responsywny i działa na każdym ekranie. Instalacja jako aplikacja (PWA) jest w planach — śledź postępy na GitHubie.',
  },
  {
    q: 'Jak działa tryb demo?',
    a: 'Kliknij "Wypróbuj demo" — gotowe. Żadnej rejestracji, żadnego e-maila. Logujesz się na przygotowane konto z przykładowymi danymi i możesz od razu przeklikać wszystkie funkcje.',
  },
]

// ── Mockup kalendarza ────────────────────────────────────────────────────────

function CalendarMockup() {
  const days = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]

  const events: [number, number, number, string, string][] = [
    [0, 1, 2, 'Spotkanie zespołu', '#6366f1'],
    [1, 0, 1, 'Siłownia', '#10b981'],
    [2, 2, 3, 'Deep work', '#f59e0b'],
    [3, 1, 1, 'Lunch z klientem', '#3b82f6'],
    [4, 0, 2, 'Przegląd zadań', '#8b5cf6'],
    [4, 3, 1, 'Kodowanie', '#6366f1'],
    [6, 1, 2, 'Planowanie tygodnia', '#ec4899'],
  ]

  const SLOT = 32

  return (
    <div
      className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-2xl select-none"
      style={{ fontFamily: 'system-ui, sans-serif', background: '#fff' }}
    >
      {/* Nagłówek dni */}
      <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: '36px repeat(7, 1fr)' }}>
        <div className="border-r border-gray-100" />
        {days.map((d, i) => (
          <div
            key={d}
            className={`text-center py-2 text-xs font-semibold border-r border-gray-100 last:border-r-0 ${
              i === 2 ? 'text-indigo-600' : 'text-gray-500'
            }`}
          >
            {d}
            {i === 2 && (
              <div className="mx-auto mt-0.5 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center leading-none">
                26
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Siatka godzin */}
      <div className="relative">
        {hours.map((h) => (
          <div
            key={h}
            className="grid border-b border-gray-100"
            style={{ gridTemplateColumns: '36px repeat(7, 1fr)', height: SLOT }}
          >
            <div className="text-right pr-1.5 text-gray-300" style={{ fontSize: 9, paddingTop: 2 }}>
              {h}:00
            </div>
            {days.map((_, di) => (
              <div
                key={di}
                className={`border-r border-gray-100 last:border-r-0 ${di === 2 ? 'bg-indigo-50/40' : ''}`}
              />
            ))}
          </div>
        ))}

        {/* Overlayed events */}
        {events.map(([dayIdx, startOff, dur, label, color], i) => (
          <div
            key={i}
            className="absolute rounded-md px-1.5 py-0.5 text-white overflow-hidden"
            style={{
              left: `calc(36px + ${dayIdx} * ((100% - 36px) / 7) + 2px)`,
              width: `calc((100% - 36px) / 7 - 4px)`,
              top: startOff * SLOT + 1,
              height: dur * SLOT - 3,
              backgroundColor: color,
              fontSize: 9,
              lineHeight: '1.3',
            }}
          >
            <div className="font-semibold truncate">{label}</div>
          </div>
        ))}

        {/* Linia aktualnej godziny */}
        <div
          className="absolute flex items-center pointer-events-none"
          style={{
            top: 2.3 * SLOT,
            left: `calc(36px + 2 * ((100% - 36px) / 7))`,
            width: `calc((100% - 36px) / 7)`,
          }}
        >
          <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <div className="flex-1 border-t-2 border-red-400" />
        </div>
      </div>
    </div>
  )
}

// ── FAQ Item ─────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <summary className="flex items-center justify-between py-4 cursor-pointer list-none text-gray-800 dark:text-gray-200 font-medium text-sm hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
        {q}
        <span className="ml-3 shrink-0 text-gray-400 group-open:rotate-180 transition-transform duration-200 text-xs">▼</span>
      </summary>
      <p className="pb-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{a}</p>
    </details>
  )
}

// ── Main LandingPage ──────────────────────────────────────────────────────────

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-gray-100 dark:border-gray-800 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <ChronoGridLogo size={32} />
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/demo')}
              className="text-sm text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors px-3 py-1.5"
            >
              Demo
            </button>
            <button
              onClick={() => navigate('/login')}
              className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-1.5 rounded-lg transition-colors"
            >
              Zaloguj się
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="flex-1 max-w-6xl mx-auto px-6 pt-20 pb-16 w-full">
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-12 items-center">
          {/* Tekst */}
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 px-3 py-1 rounded-full mb-6">
              Kalendarz zaprojektowany dla osób z ADHD
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-white leading-tight mb-5">
              Planowanie dla ludzi,<br />
              <span className="text-indigo-600 dark:text-indigo-400">którzy nienawidzą planowania.</span>
            </h1>
            <p className="text-lg text-gray-500 dark:text-gray-400 leading-relaxed mb-8">
              ChronoGrid to otwarty kalendarz dla osób, którym trudno trzymać się
              planu. Drag &amp; drop, matryca Eisenhowera, Ctrl+Z i prostota używania.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate('/demo')}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors text-sm shadow-sm"
              >
                Wypróbuj demo
              </button>
              <button
                onClick={() => navigate('/login')}
                className="px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold rounded-xl transition-colors text-sm"
              >
                Zaloguj się
              </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              Demo nie wymaga rejestracji — dane resetują się automatycznie.
            </p>
          </div>

          {/* Mockup */}
          <div className="hidden lg:block">
            <CalendarMockup />
          </div>
        </div>
      </section>

      {/* Mockup mobile */}
      <section className="lg:hidden py-12 px-6 max-w-xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 text-center">Jak to wygląda?</h2>
        <CalendarMockup />
      </section>

      {/* ── Funkcje ──────────────────────────────────────────────────────── */}
      <section className="bg-gray-50 dark:bg-gray-900 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
            Co znajdziesz w ChronoGrid
          </h2>
          <p className="text-gray-400 dark:text-gray-500 text-sm text-center mb-12">
            Wszystko, czego potrzebujesz. Nic, czego nie potrzebujesz.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center mb-3">
                  <f.Icon className="text-indigo-600 dark:text-indigo-400" size={18} />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1.5">{f.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA środkowe ─────────────────────────────────────────────────── */}
      <section className="py-20 max-w-5xl mx-auto px-6 w-full text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Gotowy, żeby spróbować?</h2>
        <p className="text-gray-400 dark:text-gray-500 text-sm mb-8">
          Nie wymaga rejestracji. Demo uruchamia się w przeglądarce.
        </p>
        <button
          onClick={() => navigate('/demo')}
          className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors text-sm shadow-sm"
        >
          Otwórz demo
        </button>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="bg-gray-50 dark:bg-gray-900 py-20">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
            Pytania i odpowiedzi
          </h2>
          <p className="text-gray-400 dark:text-gray-500 text-sm text-center mb-10">
            Masz inne pytanie? Zajrzyj na{' '}
            <a
              href="https://github.com/bie-nia/ChronoGrid"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 hover:text-indigo-400 transition-colors"
            >
              GitHub
            </a>
            {' '}lub napisz do nas.
          </p>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-6">
            {FAQ.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 dark:border-gray-800 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
            Chrono<span className="text-indigo-600 dark:text-indigo-400">Grid</span>
          </span>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Dominik Bienia · {new Date().getFullYear()}
          </p>
          <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500">
            <a
              href="https://github.com/bie-nia/ChronoGrid"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              GitHub
            </a>
            <button onClick={() => navigate('/demo')} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Demo</button>
            <button onClick={() => navigate('/login')} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Logowanie</button>
          </div>
        </div>
      </footer>

    </div>
  )
}
