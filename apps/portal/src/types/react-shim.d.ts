/**
 * React 19 ↔ third-party library type shim.
 *
 * pnpm creates multiple module identity paths for the same @types/react version,
 * causing TypeScript structural incompatibilities between our code and libraries
 * (Radix UI, vidstack) compiled against a different resolution path.
 *
 * This shim patches the two breaking changes introduced in @types/react@19:
 *  1. ReactPortal.children became required (was optional in @18)
 *  2. FC return type widened to ReactNode | Promise<ReactNode>
 *
 * Both changes cause TS2786 "cannot be used as JSX component" on library primitives.
 */
import type { ReactNode } from 'react';

declare module 'react' {
  // Fix 1: ReactPortal.children was made required in @types/react@19.
  // Libraries compiled against @18 still treat it as optional, causing
  // structural type mismatches when ReactNode is compared across pnpm paths.
  interface ReactPortal {
    children?: ReactNode;
  }

  // Fix 2: FC's return type in @types/react@19 includes Promise<ReactNode>
  // (server component support). The JSX element checker in older library
  // declarations expects only ReactNode, not the union with Promise.
  // Widening FunctionComponent's call signature makes both compatible.
  interface FunctionComponent<P = object> {
    (props: P, context?: unknown): ReactNode | Promise<ReactNode>;
  }
}
