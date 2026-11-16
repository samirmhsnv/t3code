import { ISSUE_SOURCE_LABELS, IssueTrackerError, type IssueSource } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient, type HttpClientRequest } from "effect/http";

const ErrorBody = Schema.Union([
  // Deckbell
  Schema.Struct({ error: Schema.Struct({ message: Schema.String }) }),
  // Linear GraphQL
  Schema.Struct({ errors: Schema.NonEmptyArray(Schema.Struct({ message: Schema.String })) }),
]);
const decodeErrorBody = Schema.decodeUnknownOption(ErrorBody);

const errorMessage = (body: unknown) =>
  decodeErrorBody(body).pipe(
    Option.map((decoded) =>
      "error" in decoded ? decoded.error.message : decoded.errors[0].message,
    ),
    Option.getOrUndefined,
  );

/** Sends one tracker request and decodes its JSON body; failures read as a sentence for the UI. */
export type TrackerSend = <S extends Schema.Top>(
  request: HttpClientRequest.HttpClientRequest,
  schema: S,
) => Effect.Effect<S["Type"], IssueTrackerError, S["DecodingServices"]>;

export const makeTrackerSend = (http: HttpClient.HttpClient, source: IssueSource): TrackerSend => {
  const label = ISSUE_SOURCE_LABELS[source];
  const fail = (message: string) => new IssueTrackerError({ message });
  return (request, schema) =>
    Effect.gen(function* () {
      const response = yield* http.execute(request).pipe(
        // A redirect could carry the key to another origin.
        Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
        Effect.provideService(HttpClient.TracerPropagationEnabled, false),
        Effect.mapError(() => fail(`Could not reach ${label}.`)),
      );
      const body = yield* response.json.pipe(Effect.orElseSucceed((): unknown => undefined));
      // Linear reports query errors as a 400 with a GraphQL error body, which the caller reads.
      const ok =
        (response.status >= 200 && response.status < 300) ||
        (source === "linear" && response.status === 400);
      if (!ok) {
        const detail = errorMessage(body);
        if (response.status === 401) return yield* fail(`${label} rejected the API key.`);
        if (response.status === 429) return yield* fail(`${label} is rate limiting requests.`);
        if (detail !== undefined) return yield* fail(`${label}: ${detail}`);
        if (response.status === 403) return yield* fail(`${label} rejected the API key.`);
        return yield* fail(`${label} answered with HTTP ${response.status}.`);
      }
      return yield* Schema.decodeUnknownEffect(schema)(body).pipe(
        Effect.mapError(() => fail(`${label} sent a response T3 Code does not understand.`)),
      );
    }).pipe(
      Effect.timeoutOrElse({
        duration: "15 seconds",
        orElse: () => Effect.fail(fail(`${label} did not answer in time.`)),
      }),
    );
};
