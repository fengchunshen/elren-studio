import argparse
import getpass
from sqlalchemy import select
from .db import Session
from .models import User, Project
from .security import passwords


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["create-admin"])
    parser.add_argument("--username", required=True)
    args = parser.parse_args()
    password = getpass.getpass("管理员密码（至少 12 位）: ")
    if len(password) < 12 or password != getpass.getpass("再次输入密码: "):
        raise SystemExit("密码不符合要求或两次不一致")
    with Session() as db:
        if db.scalar(select(User).where(User.username == args.username.strip().lower())):
            raise SystemExit("账号已存在")
        user = User(username=args.username.strip().lower(), password_hash=passwords.hash(password), role="admin", must_change_password=False)
        db.add(user)
        db.flush()
        db.add(Project(user_id=user.id, name="默认项目"))
        db.commit()
    print("管理员已创建")


if __name__ == "__main__":
    main()

