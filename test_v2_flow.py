import requests
import json
import time
import os

API_URL = "http://localhost:8081"
TOKEN = "dev-token" # Based on RouteBuilderRepository mock logic

def test_v2_flow():
    headers = {"Authorization": f"Bearer {TOKEN}"}
    
    # 1. Create Project
    print("--- 1. Tworzenie projektu ---")
    payload = {
        "route_type": "hiking",
        "region": "Tatry",
        "start_point": "Kuźnice",
        "loop": True,
        "distance_target_km": 15,
        "difficulty": "moderate"
    }
    res = requests.post(f"{API_URL}/route-projects", json=payload, headers=headers)
    assert res.status_code == 201
    project = res.json()
    project_id = project['id']
    print(f"Projekt utworzony: {project_id}")

    # 2. Upload Materials (Text)
    print("\n--- 2. Wgrywanie materiałów (Tekst) ---")
    file_content = "Plan wycieczki: Kuźnice -> Hala Gąsienicowa -> Zawrat -> Pięć Stawów."
    res = requests.post(
        f"{API_URL}/route-projects/{project_id}/files",
        data=file_content.encode('utf-8'),
        headers={**headers, "Content-Type": "text/plain", "x-file-name": "plan.txt"}
    )
    assert res.status_code == 200
    print("Notatki tekstowe wgrane i przetworzone.")

    # 3. Check if notes updated
    res = requests.get(f"{API_URL}/route-projects/{project_id}", headers=headers)
    project_updated = res.json()
    assert "Kuźnice" in project_updated['requirements']['input_notes']
    print("Weryfikacja: Notatki projektu zostały poprawnie zaktualizowane treścią pliku.")

    # 4. Start Job
    print("\n--- 3. Uruchamianie Joba ---")
    res = requests.post(f"{API_URL}/route-projects/{project_id}/jobs", headers=headers)
    assert res.status_code == 201
    job = res.json()
    job_id = job['id']
    print(f"Job uruchomiony: {job_id}")

    # 5. Polling Job
    print("\n--- 4. Polling Joba ---")
    for _ in range(30):
        res = requests.get(f"{API_URL}/route-projects/{project_id}/jobs/{job_id}", headers=headers)
        job_status = res.json()
        status = job_status['status']
        print(f"Status: {status} ({job_status['progress']}%) - {job_status['human_message']}")
        
        if status == 'ready':
            print("Sukces: Job zakończony pomyślnie!")
            break
        if status == 'failed':
            print(f"Błąd: Job nie powiódł się: {job_status['error_message']}")
            break
        if status == 'waiting_for_user':
            print(f"Info: Job czeka na użytkownika: {job_status['human_message']}")
            break
        time.sleep(2)
    else:
        print("Timeout: Job trwał za długo.")

    # 6. Check Artifacts
    if status == 'ready':
        print("\n--- 5. Sprawdzanie artefaktów ---")
        res = requests.get(f"{API_URL}/route-projects/{project_id}/artifacts/report", headers=headers)
        assert res.status_code == 200
        print("Artefakt: Raport/Przewodnik wygenerowany.")
        
        res = requests.get(f"{API_URL}/route-projects/{project_id}/artifacts/alternatives", headers=headers)
        assert res.status_code == 200
        print(f"Artefakt: Znaleziono {len(res.json()['content'])} alternatywnych tras.")

if __name__ == "__main__":
    # Ensure API is running
    print("Upewnij się, że 'pnpm dev' w apps/route-builder-api jest uruchomiony!")
    try:
        test_v2_flow()
    except Exception as e:
        print(f"TEST FAILED: {e}")
