export type HostEventUsage = { used: number; limit: number };

export class HostEventLimitError extends Error {
  constructor(limit: number) {
    super(`You’ve reached the ${limit}-event limit. Your saved events are still available to edit and manage. To make room for a new event or copy, export anything you need, then permanently delete an event from its Privacy & data page. Archiving doesn’t free a space.`);
    this.name = "HostEventLimitError";
  }
}
