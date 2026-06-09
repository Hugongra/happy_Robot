declare module "react-simple-maps" {
  import { ReactNode, CSSProperties } from "react";

  export interface Geography {
    rsmKey: string;
    [key: string]: unknown;
  }

  export function ComposableMap(props: {
    projection?: string;
    width?: number;
    height?: number;
    style?: CSSProperties;
    children?: ReactNode;
  }): JSX.Element;

  export function Geographies(props: {
    geography: string | object;
    children: (args: { geographies: Geography[] }) => ReactNode;
  }): JSX.Element;

  export function Geography(props: {
    geography: Geography;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: Record<string, CSSProperties>;
  }): JSX.Element;

  export function Line(props: {
    from: [number, number];
    to: [number, number];
    stroke?: string;
    strokeWidth?: number;
    strokeLinecap?: string;
    strokeOpacity?: number;
  }): JSX.Element;

  export function Marker(props: {
    coordinates: [number, number];
    children?: ReactNode;
  }): JSX.Element;

  export function useMapContext(): {
    projection: (coords: [number, number]) => [number, number] | null;
    path: unknown;
  };
}
