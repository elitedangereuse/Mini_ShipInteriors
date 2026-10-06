import { tr } from '../i18n'
import { QUIZ_LENGTH, QUIZZES, type Question, type Quiz } from './questions'

/*
 * L'interrogation de la professeure Kepler, en salle de classe (pont supérieur) : un panneau plein
 * écran, rouge, noir et blanc, tout en biais, façon Persona 5 (cf. quiz.css).
 *
 * Trois écrans : le choix de l'interrogation (cinq, rangées par matière, avec la meilleure note du
 * joueur), les questions (dix, tirées au hasard, quatre réponses mélangées ; la professeure
 * commente chaque réponse), puis le bulletin (une note de S à D). Les meilleures notes sont gardées
 * dans le navigateur : rien n'est envoyé au site, et rien n'est gagné que la gloire.
 *
 * Au clavier : les flèches et Entrée, ou les chiffres 1 à 4 pour répondre ; Échap revient en arrière.
 */

export type QuizSound = 'pick' | 'right' | 'wrong' | 'good' | 'bad'

export interface QuizHost {
  sound(kind: QuizSound): void
  /** Une réponse vient d'être donnée (la professeure réagit, cf. src/classroom.ts). */
  answered?(right: boolean): void
}

const TEACHER = tr('PROF. KEPLER', 'PROF. KEPLER')
const STORE = 'mini-shipinteriors-quiz'

interface Grade { min: number; mark: string; title: string; says: string; murmur: string }

/** Du meilleur au pire : la première note dont le seuil est atteint. */
const GRADES: Grade[] = [
  {
    min: 10, mark: 'S', title: tr('Major de promotion', 'Top of the class'),
    says: tr('Dix sur dix. Je n\'ai rien à ajouter, et cela m\'arrive rarement.', 'Ten out of ten. I have nothing to add, which rarely happens.'),
    murmur: tr('« Sans une faute… Il paraît que ça révise même en supercruise. »', '“Not one mistake… I hear they study in supercruise.”'),
  },
  {
    min: 8, mark: 'A', title: tr('Félicitations du conseil', 'Honours'),
    says: tr('Très bien. Vous feriez un pilote présentable.', 'Very good. You would make a presentable pilot.'),
    murmur: tr('« Pas mal, pour quelqu\'un qui est arrivé en retard. »', '“Not bad for someone who showed up late.”'),
  },
  {
    min: 6, mark: 'B', title: tr('Peut mieux faire', 'Could do better'),
    says: tr('Correct. Mais la galaxie ne pardonne pas les à-peu-près.', 'Decent. But the galaxy does not forgive guesswork.'),
    murmur: tr('« La moyenne. Comme son assurance vaisseau. »', '“Average. Like their ship insurance.”'),
  },
  {
    min: 4, mark: 'C', title: tr('Passable', 'Barely passing'),
    says: tr('Vous avez deviné la moitié. L\'autre moitié vous attend en retenue.', 'You guessed half of it. The other half awaits you in detention.'),
    murmur: tr('« Achenar et Alioth confondus, encore ? »', '“Didn\'t they mix up Achenar and Alioth?”'),
  },
  {
    min: 0, mark: 'D', title: tr('Retenue', 'Detention'),
    says: tr('Je vous envoie réviser à Hutton Orbital. Aller simple.', 'I am sending you to study at Hutton Orbital. One way.'),
    murmur: tr('« Chut, ne regardez pas par là. C\'est contagieux. »', '“Shh, don\'t look at them. It\'s contagious.”'),
  },
]

const RIGHT = [
  tr('Exact.', 'Correct.'),
  tr('Bonne réponse. Vous écoutiez donc.', 'Right answer. So you were listening.'),
  tr('C\'est juste. Ne prenez pas cet air surpris.', 'That is right. Don\'t look so surprised.'),
  tr('Bien. Restez assis : c\'était un compliment.', 'Good. Stay seated: that was a compliment.'),
]
const WRONG = [
  tr('Faux. Et une craie vous frôle l\'oreille.', 'Wrong. And a piece of chalk whistles past your ear.'),
  tr('Non. Vous dormiez pendant ce cours-là.', 'No. You slept through that lesson.'),
  tr('Raté. La classe retient son souffle.', 'Missed. The class holds its breath.'),
  tr('Faux. Je note, commandant. Je note tout.', 'Wrong. I am taking notes, Commander. I note everything.'),
]

const gradeOf = (score: number) => GRADES.find((g) => score >= g.min)!
const any = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Une question posée : ses réponses dans l'ordre affiché, et celle que le joueur a choisie. */
interface Asked { question: Question; answers: string[]; picked: number | null }

interface Run { quiz: Quiz; asked: Asked[]; at: number; best: boolean }

export class QuizPanel {
  private root?: HTMLElement
  private run: Run | null = null
  /** Ligne du menu, ou réponse, sous le curseur du clavier. */
  private cursor = 0
  private best: Record<string, number> = {}

  constructor(private host: QuizHost) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORE) ?? '{}')
      if (stored && typeof stored === 'object') this.best = stored
    } catch { /* Stockage indisponible, ou illisible : on repart de zéro. */ }
  }

  get isOpen() { return !!this.root }

  open() {
    if (this.root) return
    this.root = el('div', 'quiz')
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-label', tr('Interrogation', 'Quiz'))
    document.body.append(this.root)
    this.run = null
    this.cursor = 0
    this.render()
  }

  close() {
    this.root?.remove()
    this.root = undefined
    this.run = null
  }

  /** Touche pressée, panneau ouvert. */
  key(e: KeyboardEvent) {
    if (e.repeat) return
    const run = this.run
    if (e.code === 'Escape') return run ? this.menu() : this.close()
    const step = e.code === 'ArrowDown' || e.code === 'ArrowRight' || e.code === 'KeyS' || e.code === 'KeyD' ? 1
      : e.code === 'ArrowUp' || e.code === 'ArrowLeft' || e.code === 'KeyW' || e.code === 'KeyA' ? -1 : 0
    const go = e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE'
    if (!run) {
      if (step) this.point((this.cursor + step + QUIZZES.length) % QUIZZES.length)
      else if (go) this.start(QUIZZES[this.cursor])
      return
    }
    if (run.at >= run.asked.length) {
      if (go) this.start(run.quiz)
      return
    }
    const asked = run.asked[run.at]
    if (asked.picked !== null) {
      if (go) this.next()
      return
    }
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code)
    if (digit) this.pick(Number(digit[1]) - 1)
    else if (step) this.point((this.cursor + step + asked.answers.length) % asked.answers.length)
    else if (go) this.pick(this.cursor)
  }

  // ---------------------------------------------------------------- déroulement

  private menu() {
    this.run = null
    this.render()
  }

  private start(quiz: Quiz) {
    const asked = shuffled(quiz.questions).slice(0, QUIZ_LENGTH).map((question): Asked => ({ question, answers: shuffled([question.right, ...question.wrong]), picked: null }))
    this.run = { quiz, asked, at: 0, best: false }
    this.cursor = 0
    this.host.sound('pick')
    this.render()
  }

  private pick(i: number) {
    const run = this.run
    const asked = run?.asked[run.at]
    if (!run || !asked || asked.picked !== null || !asked.answers[i]) return
    asked.picked = i
    const right = asked.answers[i] === asked.question.right
    this.host.sound(right ? 'right' : 'wrong')
    this.host.answered?.(right)
    this.render()
  }

  private next() {
    const run = this.run
    if (!run) return
    run.at++
    this.cursor = 0
    if (run.at >= run.asked.length) {
      const score = this.score(run)
      const before = this.best[run.quiz.id]
      if (score > (before ?? -1)) {
        // Une première copie ratée n'est pas un « record » dont on se vante.
        run.best = before !== undefined || score >= 6
        this.best[run.quiz.id] = score
        try { localStorage.setItem(STORE, JSON.stringify(this.best)) } catch { /* Stockage indisponible. */ }
      }
      this.host.sound(score >= 6 ? 'good' : 'bad')
    } else this.host.sound('pick')
    this.render()
  }

  private score(run: Run): number {
    return run.asked.filter((a) => a.picked !== null && a.answers[a.picked] === a.question.right).length
  }

  /** Déplace le curseur du clavier, sans rejouer l'entrée en scène de l'écran. */
  private point(i: number) {
    this.cursor = i
    this.root?.querySelectorAll('.quiz-pick').forEach((b, k) => b.classList.toggle('on', k === i))
  }

  // ---------------------------------------------------------------- écrans

  private render() {
    const root = this.root
    if (!root) return
    const run = this.run
    const screen = !run ? this.menuScreen() : run.at >= run.asked.length ? this.reportScreen(run) : this.questionScreen(run)
    const back = button('quiz-back', run ? tr('‹ Changer de matière', '‹ Change subject') : tr('✕ Quitter la classe', '✕ Leave the class'), () => (run ? this.menu() : this.close()))
    back.title = tr('Échap', 'Esc')
    root.replaceChildren(el('div', 'quiz-bg'), back, screen)
    root.dataset.screen = !run ? 'menu' : run.at >= run.asked.length ? 'report' : 'question'
  }

  private menuScreen(): HTMLElement {
    const screen = el('div', 'quiz-screen quiz-menu')
    const list = el('div', 'quiz-list')
    let subject = ''
    QUIZZES.forEach((quiz, i) => {
      if (quiz.subject !== subject) {
        subject = quiz.subject
        list.append(el('div', 'quiz-subject', subject === 'elite' ? tr('Univers d\'Elite', 'The Elite universe') : tr('Élite Dangereuse', 'Élite Dangereuse')))
      }
      const row = button('quiz-pick quiz-row' + (i === this.cursor ? ' on' : ''), '', () => this.start(quiz))
      row.onpointerenter = () => this.point(i)
      const best = this.best[quiz.id]
      const text = el('span', 'quiz-row-text')
      text.append(el('strong', '', quiz.name), el('small', '', quiz.blurb))
      row.append(
        el('span', 'quiz-stars', '★'.repeat(quiz.stars) + '☆'.repeat(3 - quiz.stars)),
        text,
        el('span', 'quiz-best' + (best === undefined ? ' none' : ''), best === undefined ? '—' : `${gradeOf(best).mark} · ${best}/${QUIZ_LENGTH}`),
      )
      list.append(row)
    })
    screen.append(
      ransom(tr('INTERRO SURPRISE', 'POP QUIZ')),
      this.bubble(tr('Asseyez-vous, commandant. Sortez une feuille, et choisissez votre matière.', 'Take a seat, Commander. Take out a sheet of paper, and pick your subject.')),
      list,
      el('p', 'quiz-hint', tr('Dix questions par interrogation. Flèches et Entrée, ou cliquez.', 'Ten questions per quiz. Arrows and Enter, or click.')),
    )
    return screen
  }

  private questionScreen(run: Run): HTMLElement {
    const asked = run.asked[run.at]
    const { question, answers, picked } = asked
    const done = picked !== null
    const right = done && answers[picked] === question.right
    const screen = el('div', 'quiz-screen quiz-question' + (done ? (right ? ' is-right' : ' is-wrong') : ''))

    const head = el('div', 'quiz-head')
    const count = el('div', 'quiz-count')
    count.append(el('small', '', 'Q.'), el('b', '', String(run.at + 1).padStart(2, '0')), el('i', '', `/${run.asked.length}`))
    const pips = el('div', 'quiz-pips')
    run.asked.forEach((a, i) => {
      const state = a.picked === null ? (i === run.at ? 'now' : '') : a.answers[a.picked] === a.question.right ? 'ok' : 'ko'
      pips.append(el('span', 'quiz-pip ' + state))
    })
    head.append(count, el('div', 'quiz-course', run.quiz.name), pips)

    const says = !done ? question.q
      : right ? [any(RIGHT), question.why].filter(Boolean).join(' ')
        : [any(WRONG), tr(`La bonne réponse : ${question.right}.`, `The right answer: ${question.right}.`), question.why].filter(Boolean).join(' ')
    const answersEl = el('div', 'quiz-answers')
    answers.forEach((answer, i) => {
      const state = !done ? (i === this.cursor ? ' on' : '') : answer === question.right ? ' right' : i === picked ? ' wrong' : ' out'
      const b = button('quiz-pick quiz-answer' + state, '', () => this.pick(i))
      b.disabled = done
      if (!done) b.onpointerenter = () => this.point(i)
      b.append(el('kbd', '', String(i + 1)), el('span', '', answer))
      answersEl.append(b)
    })
    screen.append(head, this.bubble(says), answersEl)
    if (done) {
      screen.append(el('div', 'quiz-stamp', right ? tr('CORRECT !', 'CORRECT!') : tr('RATÉ !', 'WRONG!')))
      if (right) screen.append(el('div', 'quiz-knowledge', tr('♪ Connaissance +1', '♪ Knowledge +1')))
      const last = run.at + 1 >= run.asked.length
      const next = button('quiz-next', last ? tr('Rendre la copie ▶', 'Hand in ▶') : tr('Question suivante ▶', 'Next question ▶'), () => this.next())
      screen.append(next)
    }
    return screen
  }

  private reportScreen(run: Run): HTMLElement {
    const score = this.score(run)
    const grade = gradeOf(score)
    const screen = el('div', 'quiz-screen quiz-report')
    const mark = el('div', 'quiz-mark')
    mark.append(el('b', '', grade.mark))
    const card = el('div', 'quiz-card')
    const total = el('div', 'quiz-total')
    total.append(el('b', '', String(score)), el('i', '', `/${run.asked.length}`))
    card.append(el('small', 'quiz-card-course', run.quiz.name), total, el('strong', 'quiz-card-title', grade.title))
    if (run.best) card.append(el('span', 'quiz-record', tr('Nouveau record !', 'New best!')))
    const actions = el('div', 'quiz-actions')
    actions.append(
      button('quiz-next', tr('Repasser l\'interro ▶', 'Retake the quiz ▶'), () => this.start(run.quiz)),
      button('quiz-next alt', tr('Autre matière', 'Another subject'), () => this.menu()),
      button('quiz-next alt', tr('Quitter la classe', 'Leave the class'), () => this.close()),
    )
    screen.append(ransom(tr('BULLETIN', 'REPORT CARD')), mark, card, this.bubble(grade.says), el('p', 'quiz-murmur', grade.murmur), actions)
    return screen
  }

  /** La bulle de la professeure : son nom sur une étiquette, et ce qu'elle dit. */
  private bubble(text: string): HTMLElement {
    const bubble = el('div', 'quiz-bubble')
    const inner = el('div', 'quiz-bubble-in')
    inner.append(el('p', '', text))
    bubble.append(el('span', 'quiz-name', TEACHER), inner)
    return bubble
  }
}

/** Titre en lettres découpées : chaque lettre sur son bout de papier, de travers. */
function ransom(text: string): HTMLElement {
  const title = el('h2', 'quiz-ransom')
  title.setAttribute('aria-label', text)
  const tilt = [-7, 5, -3, 8, -5, 3, 6, -8, 4, -4]
  let k = 0
  for (const word of text.split(' ')) {
    const group = el('span', 'quiz-word')
    group.setAttribute('aria-hidden', 'true')
    for (const letter of word) {
      const span = el('span', `quiz-letter v${k % 4}`, letter)
      span.style.setProperty('--tilt', `${tilt[k % tilt.length]}deg`)
      span.style.setProperty('--i', String(k))
      group.append(span)
      k++
    }
    title.append(group)
  }
  return title
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text) as HTMLButtonElement
  b.type = 'button'
  b.onclick = onClick
  return b
}
