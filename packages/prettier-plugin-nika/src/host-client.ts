export class HostClient {
  format(source: string): string {
    // TODO: send the content to the Roslyn host.
    return source;
  }
}

export const hostClient = new HostClient();
