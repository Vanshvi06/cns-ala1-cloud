# ALA 1: Cloud Task Manager: AWS Deployment Guide (EC2 + S3)

**Architecture**

```
User browser ──HTTP──► EC2 (Ubuntu) ── Nginx :80 ──► Node.js app :3000
                                                         │
                                  tasks.json (EBS disk) ◄┤
                                  uploaded files ───────► S3 bucket (via IAM role)
```

| Marks area | Kaha dikhega |
|---|---|
| Compute service | EC2 instance (VM) |
| Storage service | S3 bucket + EBS disk |
| Internet accessibility | Public IP / Elastic IP par app |
| Resource management | CloudWatch, Budget, Stop/Start, in-app live stats |
| Submission | GitHub repo + live URL + screenshots |

---

## PHASE 0: Taiyari

1. **AWS account**: https://aws.amazon.com → Create account (email, phone, card lagta hai).
2. **GitHub account**: https://github.com
3. Computer par **Git** install karo: https://git-scm.com/downloads
4. AWS console me upar right me region **Asia Pacific (Mumbai) ap-south-1** select karo. Ye region poore kaam me same rakhna hai.

## PHASE 1: Code GitHub par daalo

1. GitHub → New repository → naam `cns-ala1-cloud` → **Public** → Create.
2. Is zip ko extract karo. Folder ke andar terminal/PowerShell kholo:

```
git init
git add .
git commit -m "ALA 1 Cloud Task Manager"
git branch -M main
git remote add origin https://github.com/<USERNAME>/cns-ala1-cloud.git
git push -u origin main
```

(Login maange to browser wala sign-in ya Personal Access Token use karo.)

## PHASE 2: S3 bucket banao (Storage)

1. AWS console → search **S3** → **Create bucket**.
2. Bucket name: `ala1-storage-<apna-naam>-<random-number>` (poori duniya me unique hona chahiye, sirf lowercase).
3. Region: **ap-south-1**.
4. **Block all public access = ON** (default rehne do). App signed links use karta hai, to public karne ki zarurat nahi.
5. Create bucket. Bucket ka naam note karo.

## PHASE 3: IAM Role banao (EC2 ko S3 ki permission)

1. Console → **IAM** → Roles → **Create role**.
2. Trusted entity: **AWS service** → Use case: **EC2** → Next.
3. Permission me search karo **AmazonS3FullAccess** → tick karo → Next.
4. Role name: `ala1-ec2-s3-role` → Create role.

## PHASE 4: EC2 instance banao (Compute)

1. Console → **EC2** → **Launch instance**.
2. **Name**: `ala1-server`
3. **AMI**: Ubuntu Server 22.04 LTS (Free tier eligible)
4. **Instance type**: `t2.micro` ya `t3.micro` (Free tier eligible wala)
5. **Key pair**: Create new key pair → `ala1-key` → RSA → `.pem` → download. Isse safe rakho, GitHub par kabhi mat daalo.
6. **Network settings → Edit**:
   - Auto-assign public IP: **Enable**
   - Security group: Create new → naam `ala1-sg`
   - Rule 1: SSH, port 22, source **My IP**
   - Rule 2: **HTTP**, port 80, source **Anywhere (0.0.0.0/0)**
7. **Storage**: 8 GiB gp3 (default).
8. **Advanced details → IAM instance profile**: `ala1-ec2-s3-role` select karo.
9. **Launch instance**.
10. Instances list me status **Running** hone do. **Public IPv4 address** note karo.

> Agar instance pehle ban chuka hai: Instance select → Actions → Security → **Modify IAM role** → role attach karo.

## PHASE 5: Server par app chalao

1. EC2 → instance select → **Connect** → tab **EC2 Instance Connect** → **Connect**. Browser me terminal khulega.
2. Ye commands ek-ek karke chalao:

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git
node -v
```

3. Code lao aur install karo:

```bash
git clone https://github.com/<USERNAME>/cns-ala1-cloud.git app
cd app
npm install
```

4. App start karo (**BUCKET_NAME** apne S3 bucket ka naam daalo):

```bash
sudo npm install -g pm2
S3_BUCKET=BUCKET_NAME AWS_REGION=ap-south-1 pm2 start server.js --name ala1
pm2 save
pm2 startup
```

`pm2 startup` ek command print karega (`sudo env PATH=...`). Use **copy karke chalao**, phir dobara `pm2 save`. Isse reboot ke baad bhi app chalta rahega.

5. Nginx se port 80 par lao:

```bash
sudo tee /etc/nginx/sites-available/default > /dev/null <<'EOF'
server {
  listen 80 default_server;
  server_name _;
  client_max_body_size 6M;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
EOF
sudo nginx -t
sudo systemctl restart nginx
```

6. Browser me kholo: `http://<PUBLIC-IP>` → home page aana chahiye → **Open Project** dabao.

### Problem aaye to
| Problem | Fix |
|---|---|
| Page nahi khulta | Security group me HTTP 80 hai? Browser me `http://` use kiya (https nahi)? |
| 502 Bad Gateway | `pm2 list` dekho, app online hai? `pm2 logs ala1` |
| S3 upload error | IAM role attach hai? `pm2 restart ala1 --update-env` aur bucket naam sahi hai? |
| Code update karna ho | `cd ~/app && git pull && npm install && pm2 restart ala1 --update-env` |

## PHASE 6: Resource Management (marks yahin zyada hain)

1. **Elastic IP** (fixed IP): EC2 → Elastic IPs → Allocate → Associate with `ala1-server`. Ab stop/start par IP nahi badlega. Ab ye IP final live URL hai.
2. **CloudWatch graph**: EC2 → instance → **Monitoring** tab → CPU utilization graph. App par thoda load do (page refresh, uploads), fir screenshot lo.
3. **Budget alert**: Console → **Billing and Cost Management → Budgets** → Create budget → Zero spend ya $1 → apna email do.
4. **Stop/Start demo**: Instance state → Stop → Start. Dono ke screenshot lo, fir app dobara check karo.
5. **Server resources**: terminal me `top` (band karne ko `q`), `free -h`, `df -h` chalake screenshot lo.
6. App ke **Resource Management** section ka screenshot lo (CPU, memory, disk live).

## PHASE 7: Screenshots (minimum 12)

1. EC2 instance Running (Name, type, region, public IP dikhe)
2. Security group inbound rules
3. IAM role (permissions tab)
4. S3 bucket (region aur name)
5. S3 bucket ke andar uploaded files
6. Browser: home page (URL bar me public IP dikhe)
7. Browser: project page, Tasks added
8. Browser: file upload hone ke baad list
9. Browser: Resource Management + Deployment Details section
10. CloudWatch CPU graph
11. Budget alert
12. Terminal: `pm2 list` aur `df -h`

> Har screenshot me URL bar ya AWS console ka upar wala hissa dikhna chahiye.

## PHASE 8: Portal par Submission

1. **Source code**: GitHub repo link.
2. **Deployment details** (PDF ya text me, template):

```
Cloud Platform : Amazon Web Services (AWS)
Region         : Asia Pacific (Mumbai) ap-south-1
Compute        : Amazon EC2, t2.micro, Ubuntu 22.04
Web server     : Nginx (reverse proxy) + Node.js app (PM2)
Storage        : Amazon S3 bucket <name> + EBS 8 GB
Access control : IAM Role (S3), Security Group (22, 80)
Live URL       : http://<ELASTIC-IP>
Resource mgmt  : CloudWatch metrics, Budget alert, Elastic IP, Stop/Start
GitHub         : https://github.com/<USERNAME>/cns-ala1-cloud
```

3. **Screenshots** (Phase 7).
4. Running app ka screenshot GMIU portal par upload karo.

## PHASE 9: Cleanup (marks milne ke baad)

Jab tak evaluation chal rahi hai, instance **chalne do**. Marks aane ke baad:
1. EC2 instance → **Terminate**.
2. **Elastic IP release** karo (nahi to charge lagta hai).
3. S3 bucket ki files delete karo, phir bucket delete karo.
4. Budget alert band mat karo jab tak sab delete na ho jaye.
