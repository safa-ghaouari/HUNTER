import json
import os
import sys
from urllib import request


OPENCTI_URL = os.environ.get("OPENCTI_BASE_URL", "http://localhost:8080").rstrip("/")
OPENCTI_TOKEN = os.environ.get("OPENCTI_ADMIN_TOKEN") or os.environ.get("OPENCTI_TOKEN")


def graphql(query: str, variables: dict | None = None) -> dict:
    payload = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = request.Request(
        f"{OPENCTI_URL}/graphql",
        data=payload,
        headers={
            "Authorization": f"Bearer {OPENCTI_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=20) as response:  # noqa: S310
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    target = sys.argv[1] if len(sys.argv) > 1 else "Mutation"
    query = """
    query($name: String!) {
      __type(name: $name) {
        name
        kind
        inputFields {
          name
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
        enumValues {
          name
        }
        fields {
          name
          args {
            name
            type {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
    """
    payload = graphql(query, {"name": target})
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
