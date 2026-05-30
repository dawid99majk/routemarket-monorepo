import requests
import time
import json

API_URL = "http://localhost:8081"
TOKEN = "dev-token"

def run_test_scenario(name, payload):
    headers = {"Authorization": f"Bearer {TOKEN}"}
    print(f"\n>>> TEST: {name}")
    
    # 1. Create Project
    res = requests.post(f"{API_URL}/route-projects", json=payload, headers=headers)
    if res.status_code != 201:
        print(f"FAILED to create project: {res.text}")
        return
    project = res.json()
    project_id = project['id']
    print(f"Project created: {project_id}")

    # 2. Start Job
    res = requests.post(f"{API_URL}/route-projects/{project_id}/jobs", headers=headers)
    if res.status_code != 201:
        print(f"FAILED to start job: {res.text}")
        return
    job = res.json()
    job_id = job['id']
    print(f"Job started: {job_id}")

    # 3. Wait for completion
    status = "queued"
    for _ in range(30):
        res = requests.get(f"{API_URL}/route-projects/{project_id}/jobs/{job_id}", headers=headers)
        job_data = res.json()
        status = job_data['status']
        if status in ['ready', 'failed', 'waiting_for_user']:
            break
        time.sleep(1)
    
    print(f"Job finished with status: {status}")
    if status == 'ready':
        # 4. Check Artifacts
        res = requests.get(f"{API_URL}/route-projects/{project_id}/artifacts/summary", headers=headers)
        if res.status_code == 200:
            summary = res.json()['content']
            points_count = len(summary.get('track', []))
            distance = summary.get('distance_km', 0)
            print(f"SUCCESS: Distance={distance}km, Points={points_count}")
            
            density = points_count / distance if distance > 0 else 0
            print(f"Density: {density:.2f} points/km")
            
            if name == "10km Hiking":
                if points_count >= 20:
                    print("VERDICT: PASS (>= 20 points for 10km)")
                else:
                    print("VERDICT: FAIL (< 20 points for 10km)")
            elif name == "200km Motorcycle":
                if points_count >= 150:
                    print("VERDICT: PASS (>= 150 points for 200km)")
                else:
                    print(f"VERDICT: FAIL (< 150 points for 200km, got {points_count})")
        else:
            print("FAILED to get summary artifact")

if __name__ == "__main__":
    # Ensure API is running
    print("Testing RouteMarket Builder V2 Point Density...")
    
    # Scenario A: 10km Hiking
    run_test_scenario("10km Hiking", {
        "route_type": "hiking",
        "region": "Tatry",
        "start_point": "Zakopane",
        "loop": True,
        "distance_target_km": 10,
        "difficulty": "moderate"
    })

    # Scenario B: 200km Motorcycle
    run_test_scenario("200km Motorcycle", {
        "route_type": "motorcycle",
        "region": "Bieszczady",
        "start_point": "Ustrzyki Dolne",
        "loop": True,
        "distance_target_km": 200,
        "difficulty": "hard"
    })
