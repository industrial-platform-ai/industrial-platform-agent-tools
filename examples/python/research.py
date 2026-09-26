import json
import os
import sys
import urllib.error
import urllib.request


API_URL = (
    "https://api.apify.com/v2/actors/"
    "industrial_platform~research-brief-agent/"
    "run-sync-get-dataset-items?clean=true&format=json"
)


def main():
    token = os.environ.get("APIFY_TOKEN")

    if not token:
        print(
            "Error: APIFY_TOKEN is not set.",
            file=sys.stderr,
        )
        sys.exit(1)

    payload = {
        "research_question": (
            "Compare HubSpot CRM, Pipedrive, and Zoho CRM "
            "for a five-person small business."
        ),
        "context": (
            "The business needs predictable pricing, automation, "
            "integrations, and straightforward administration."
        ),
        "requirements": (
            "Use current authoritative sources. Include a comparison "
            "table, cite sources, identify pricing caveats, and state "
            "unresolved facts."
        ),
    }

    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=310) as response:
            result = json.load(response)

    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        print(
            f"Apify API returned HTTP {error.code}:\n{body}",
            file=sys.stderr,
        )
        sys.exit(1)

    except urllib.error.URLError as error:
        print(
            f"Network error: {error}",
            file=sys.stderr,
        )
        sys.exit(1)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
