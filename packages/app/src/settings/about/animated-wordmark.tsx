import { createEffect, For, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"

const target = ["c", "h", "a", "s", "s", "i", "s"] as const

const choices = ["c", "h", "a", "s", "i"] as const

export function AnimatedWordmark(props: { active: boolean }) {
  const [state, setState] = createStore({ letters: [...target] })
  const timers = new Set<ReturnType<typeof setTimeout>>()

  createEffect(
    on(
      () => props.active,
      (active) => {
        timers.forEach(clearTimeout)
        timers.clear()

        if (!active || matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setState("letters", [...target])

          return
        }

        const starts = target.map(() => choices[Math.floor(Math.random() * choices.length)])
        const settles = target.map(() => 6 + Math.floor(Math.random() * 8))
        const last = Math.max(...settles)
        setState("letters", starts)

        Array.from({ length: last }, (_, index) => index + 1).forEach((tick) => {
          const timer = setTimeout(() => {
            setState(
              "letters",
              target.map((letter, index) =>
                tick >= settles[index] ? letter : choices[Math.floor(Math.random() * choices.length)],
              ),
            )
            timers.delete(timer)
          }, tick * 75)

          timers.add(timer)
        })
      },
    ),
  )

  onCleanup(() => timers.forEach(clearTimeout))

  return (
    <svg class="settings-about-wordmark" viewBox="0 0 204 42" aria-hidden="true">
      <defs>
        <symbol id="settings-about-letter-c" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M24 30H6V18H24V30Z" />
          <path d="M24 12H6V30H24V36H0V6H24V12Z" />
        </symbol>
        <symbol id="settings-about-letter-h" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M18 36H6V18H18V36Z" />
          <path d="M18 12H6V36H0V0H6V6H18V12ZM24 36H18V12H24V36Z" />
        </symbol>
        <symbol id="settings-about-letter-a" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M18 30H6V24H18V30Z" />
          <path d="M6 12H18V18H6V24H18V30H6V36H0V6H6V12ZM24 36H18V6H24V36Z" />
        </symbol>
        <symbol id="settings-about-letter-s" viewBox="0 0 24 42">
          <path class="settings-about-letter-shadow" d="M18 30H6V24H18V30Z" />
          <path d="M0 6H24V12H6V18H18V24H6V30H24V36H0V30H6V24H18V18H6V12H0V6Z" />
        </symbol>
        <symbol id="settings-about-letter-i" viewBox="0 0 24 42">
          <path d="M15 6H9V0H15V6ZM15 36H9V12H15V36Z" />
        </symbol>
      </defs>
      <For each={state.letters}>
        {(letter, index) => (
          <use href={`#settings-about-letter-${letter}`} x={index() * 30} width="24" height="42" />
        )}
      </For>
    </svg>
  )
}
