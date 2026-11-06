import { createUniqueId, type ComponentProps } from "solid-js"

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 204 42"
      fill="none"
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible [&_path]:[vector-effect:non-scaling-stroke]": props.outline,
      }}
    >
      <g opacity={props.muted === false ? 1 : 0.6} class="[[data-color-scheme=dark]_&]:opacity-100">
        <g mask={props.fade === false ? undefined : `url(#${mask})`}>
          <g
            opacity={props.muted === false ? 1 : 0.16 * 0.7}
            fill={props.outline ? "none" : "currentColor"}
            stroke={props.outline ? "currentColor" : undefined}
            stroke-width={props.outline ? 1 : undefined}
          >
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M24 12H6V30H24V36H0V6H24V12Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M48 12H36V36H30V0H36V6H48V12ZM54 36H48V12H54V36Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M66 12H78V18H66V24H78V30H66V36H60V6H66V12ZM84 36H78V6H84V36Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M90 6H114V12H96V18H108V24H96V30H114V36H90V30H96V24H108V18H96V12H90V6Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M120 6H144V12H126V18H138V24H126V30H144V36H120V30H126V24H138V18H126V12H120V6Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M165 6H159V0H165V6ZM165 36H159V12H165V36Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M180 6H204V12H186V18H198V24H186V30H204V36H180V30H186V24H198V18H186V12H180V6Z"
            />
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="204" height="42">
          <rect width="204" height="42" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="102" y1="22" x2="102" y2="42" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
