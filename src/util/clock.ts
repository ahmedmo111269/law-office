/**
 * Time is injected so that tests are deterministic and so that server and
 * device clocks are never conflated with record revisions.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  private current: Date;

  constructor(isoTimestamp: string) {
    this.current = new Date(isoTimestamp);
    if (Number.isNaN(this.current.getTime())) {
      throw new TypeError(`Invalid fixed clock value: ${isoTimestamp}`);
    }
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(isoTimestamp: string): void {
    this.current = new Date(isoTimestamp);
  }
}
