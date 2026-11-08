// The services reach the screens through one context; the host composes them once (ADR-0020: the
// stores are host-agnostic and work unchanged in the web host, the mobile host and Storybook).
import { createContext, type ReactNode, useContext } from 'react';
import type { Services } from './create';

const ServicesContext = createContext<Services | null>(null);

export type ServicesProviderProps = {
  readonly services: Services;
  readonly children: ReactNode;
};

export function ServicesProvider({ services, children }: ServicesProviderProps) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (services === null) throw new Error('useServices needs a ServicesProvider above it');
  return services;
}
