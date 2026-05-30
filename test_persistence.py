import requests
import time
import json

API_URL = "http://localhost:8081"
TOKEN = "dev-token"

def test_requirements_persistence():
    headers = {"Authorization": f"Bearer {TOKEN}"}
    print("\n>>> TEST: Persistence of requirements after update")
    
    # 1. Create Project with defaults
    res = requests.post(f"{API_URL}/route-projects", json={
        "route_type": "hiking",
        "region": "Initial Region",
        "start_point": "Initial Start",
        "distance_target_km": 5,
        "difficulty": "easy"
    }, headers=headers)
    project = res.json()
    project_id = project['id']
    print(f"Project created: {project_id}")

    # 2. Update requirements (Simulate Adaptive Interview update)
    # The frontend was missing these fields in PATCH
    res = requests.patch(f"{API_URL}/route-projects/{project_id}", json={
        "region": "Tatry",
        "start_point": "Zakopane",
        "distance_target_km": 35,
        "difficulty": "hard",
        "loop": True
    }, headers=headers)
    print(f"PATCH status: {res.status_code}")

    # 3. Verify server-side requirements
    res = requests.get(f"{API_URL}/route-projects/{project_id}", headers=headers)
    server_reqs = res.json()['requirements']
    print(f"Server distance: {server_reqs.get('distance_target_km')}")
    print(f"Server region: {server_reqs.get('region')}")
    
    if server_reqs.get('distance_target_km') == 35 and server_reqs.get('region') == "Tatry":
        print("VERDICT: PASS (Requirements persisted)")
    else:
        print("VERDICT: FAIL (Requirements NOT persisted)")

    # 4. Start Job and check resulting distance
    requests.post(f"{API_URL}/route-projects/{project_id}/jobs", headers=headers)
    
    # Wait for completion
    for _ in range(10):
        res = requests.get(f"{API_URL}/route-projects/{project_id}/jobs", params={"limit": 1}, headers=headers)
        job = res.json()['jobs'][0]
        if job['status'] == 'ready': break
        time.sleep(1)
    
    res = requests.get(f"{API_URL}/route-projects/{project_id}/artifacts/summary", headers=headers)
    summary = res.json()['content']
    print(f"Final generated distance: {summary.get('distance_km')} km")
    
    if summary.get('distance_km') >= 30:
         print("VERDICT: PASS (Generated distance is realistic)")
    else:
         print(f"VERDICT: FAIL (Generated distance is too short: {summary.get('distance_km')} km)")

if __name__ == "__main__":
    test_requirements_persistence()
