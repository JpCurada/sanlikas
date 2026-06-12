/** Static emergency hotlines — zero network dependencies (cross-cutting req). */
export interface Hotline {
  agency: string;
  description: string;
  /** Human-readable number(s). */
  display: string;
  /** Dialable number for tel: links. */
  dial: string;
}

export const HOTLINES: Hotline[] = [
  {
    agency: 'National Emergency Hotline',
    description: 'All emergencies nationwide (police, fire, medical)',
    display: '911',
    dial: '911',
  },
  {
    agency: 'NDRRMC',
    description: 'National Disaster Risk Reduction and Management Council — Operations Center',
    display: '(02) 8911-5061 to 65',
    dial: '0289115061',
  },
  {
    agency: 'MMDA',
    description: 'Metropolitan Manila Development Authority — flooding, road incidents, rescue',
    display: '136',
    dial: '136',
  },
  {
    agency: 'Philippine Red Cross',
    description: 'Emergency response, ambulance, and welfare services',
    display: '143',
    dial: '143',
  },
  {
    agency: 'Bureau of Fire Protection (NCR)',
    description: 'Fire emergencies in Metro Manila',
    display: '(02) 8426-0219',
    dial: '0284260219',
  },
];
