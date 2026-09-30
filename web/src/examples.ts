import selectedExamples from './generated/examples.json';

export interface Example {
  id: string;
  title: string;
  description: string;
  vehicles: number;
  stations: number;
  layout: string;
  instanceFile: string;
  solutionFile: string;
  instanceImage: string;
  solutionImage: string;
}

export const examples: Example[] = selectedExamples;
