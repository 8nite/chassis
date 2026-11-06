import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M12 16H4V8H12V16Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-o" d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M60 80H20V40H60V80Z" fill="var(--icon-base)" />
      <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 204 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        <path d="M24 30H6V18H24V30Z" fill="var(--icon-weak-base)" />
        <path d="M24 12H6V30H24V36H0V6H24V12Z" fill="var(--icon-base)" />
        <path d="M48 36H36V18H48V36Z" fill="var(--icon-weak-base)" />
        <path d="M48 12H36V36H30V0H36V6H48V12ZM54 36H48V12H54V36Z" fill="var(--icon-base)" />
        <path d="M78 30H66V24H78V30Z" fill="var(--icon-weak-base)" />
        <path d="M66 12H78V18H66V24H78V30H66V36H60V6H66V12ZM84 36H78V6H84V36Z" fill="var(--icon-base)" />
        <path d="M108 30H96V24H108V30Z" fill="var(--icon-weak-base)" />
        <path d="M90 6H114V12H96V18H108V24H96V30H114V36H90V30H96V24H108V18H96V12H90V6Z" fill="var(--icon-base)" />
        <path d="M138 30H126V24H138V30Z" fill="var(--icon-weak-base)" />
        <path d="M120 6H144V12H126V18H138V24H126V30H144V36H120V30H126V24H138V18H126V12H120V6Z" fill="var(--icon-strong-base)" />
        <path d="M165 6H159V0H165V6ZM165 36H159V12H165V36Z" fill="var(--icon-strong-base)" />
        <path d="M198 30H186V24H198V30Z" fill="var(--icon-weak-base)" />
        <path d="M180 6H204V12H186V18H198V24H186V30H204V36H180V30H186V24H198V18H186V12H180V6Z" fill="var(--icon-strong-base)" />
      </g>
    </svg>
  )
}
