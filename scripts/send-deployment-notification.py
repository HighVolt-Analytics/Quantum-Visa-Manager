import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from send_mail_graph import send_mail


DEPLOY_JOB_NAME = "Deploy and verify production release"
ROLLBACK_STEP_NAME = "Restore pre-deployment snapshot after a release failure"
PUBLIC_URL = "https://quantumvisamanager.com"


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Missing required notification setting: {name}")
    return value


def github_run_details():
    repository = required("GITHUB_REPOSITORY")
    run_id = required("GITHUB_RUN_ID")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/actions/runs/{run_id}/jobs",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {required('GH_TOKEN')}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        jobs = json.load(response).get("jobs", [])

    run_request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/actions/runs/{run_id}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {required('GH_TOKEN')}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(run_request, timeout=15) as response:
        created_at = json.load(response).get("run_started_at") or "unknown"

    failed_stage = "none"
    rollback_attempted = "No"
    rollback_result = "Not required"
    for job in jobs:
        if job.get("name") != DEPLOY_JOB_NAME:
            continue
        failed = next(
            (step for step in job.get("steps", []) if step.get("conclusion") == "failure"),
            None,
        )
        if failed:
            failed_stage = failed.get("name", "unknown")
        rollback = next(
            (step for step in job.get("steps", []) if step.get("name") == ROLLBACK_STEP_NAME),
            None,
        )
        if rollback and rollback.get("conclusion") != "skipped":
            rollback_attempted = "Yes"
            rollback_result = "Verified" if rollback.get("conclusion") == "success" else "Failed"
    return failed_stage, rollback_attempted, rollback_result, created_at


def live_health():
    marker = "unavailable"
    ok = False
    try:
        request = urllib.request.Request(f"{PUBLIC_URL}/deploy-info.txt")
        with urllib.request.urlopen(request, timeout=12) as response:
            marker = response.read(4096).decode("utf-8", errors="replace").strip()
        with urllib.request.urlopen(f"{PUBLIC_URL}/", timeout=12) as response:
            ok = response.status == 200
        summary = f"HTTPS homepage: {'healthy' if ok else 'unhealthy'}; Live marker: {marker}"
    except (OSError, urllib.error.URLError, TimeoutError):
        summary = "HTTPS homepage/marker: unavailable"
    return ok, marker, summary


def main():
    required("MAIL_TENANT_ID")
    required("MAIL_CLIENT_ID")
    sender = required("MAIL_FROM")
    recipients = required("MAIL_TO")
    release = required("RELEASE_COMMIT")
    repository = required("GITHUB_REPOSITORY")
    run_url = f"{os.environ['GITHUB_SERVER_URL']}/{repository}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    trigger = f"{required('DEPLOY_EVENT')} by {required('GITHUB_ACTOR')}"
    build_result = os.environ.get("BUILD_RESULT", "unknown")
    deploy_result = os.environ.get("DEPLOY_RESULT", "unknown")
    public_marker_status = os.environ.get("PUBLIC_MARKER_STATUS", "unavailable")
    rollback_job_output = os.environ.get("ROLLBACK_RESULT", "")
    deployer = os.environ.get("DEPLOYER_NAME", "unknown").strip() or "unknown"
    deployer_email = os.environ.get("DEPLOYER_EMAIL", "unknown").strip() or "unknown"
    triggered_from = os.environ.get("TRIGGERED_FROM", "GitHub").strip() or "GitHub"
    failed_stage, rollback_attempted, rollback_result, started_at = github_run_details()
    if rollback_job_output == "verified":
        rollback_result = "Verified"
    healthy, marker, health_summary = live_health()
    public_marker_verified = public_marker_status in {"matched", "stale_warning"}
    success = deploy_result == "success" and healthy and public_marker_verified
    marker_summary = {
        "matched": "Matched intended release",
        "stale_warning": "WARNING: public deploy-info.txt is stale; all other public release content matched the immutable artifact",
    }.get(public_marker_status, "Not verified")
    subject = (
        f"Quantum Visa Manager production {'SUCCESS' if success else 'FAILURE'} — {release[:12]}"
    )
    body = "\n".join(
        [
            "Quantum Visa Manager production deployment outcome",
            "Domain: quantumvisamanager.com",
            f"Repository and branch: {repository} / main",
            f"Commit: {release}",
            f"Initiator or trigger: {trigger}",
            f"Deployer: {deployer} <{deployer_email}>",
            f"Triggered from: {triggered_from}",
            f"GitHub Actions run: {run_url}",
            f"Deployment timestamp (UTC): {started_at}",
            f"Final result: {'Success' if success else 'Failure'} (build={build_result}, deploy={deploy_result})",
            f"Health checks: {'deployment routes verified by deploy workflow' if deploy_result == 'success' else 'deployment checks did not all pass'}; {health_summary}",
            f"Public marker consistency: {marker_summary}",
            f"Failure stage: {failed_stage if deploy_result != 'success' else ('none' if success else 'Final live site verification')}",
            f"Rollback attempted: {rollback_attempted}",
            f"Rollback result: {rollback_result}",
            f"Final live marker: {marker}",
            f"Final live homepage health: {'healthy' if healthy else 'unhealthy'}",
        ]
    )
    send_mail(subject, body, sender, recipients)
    print("Email notification sent.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Email notification failed ({type(error).__name__}).", file=sys.stderr)
        sys.exit(1)
