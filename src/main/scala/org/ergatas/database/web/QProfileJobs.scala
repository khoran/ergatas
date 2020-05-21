package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QProfileJobs extends QProfileJobs("profileJobs") {
  override def as(variable: String) = new QProfileJobs(variable)

}

class QProfileJobs(md: PathMetadata[_]) extends RelationalPathImpl[ProfileJobs](md, "web", "profile_jobs") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

  val jobCatagoryKey = createNumber[Int]("jobCatagoryKey")

  val missionaryProfileKey = createNumber[Int]("missionaryProfileKey")

  val profileJobKey = createNumber[Int]("profileJobKey")

  val profileJobsPkey: PrimaryKey[ProfileJobs] = createPrimaryKey(profileJobKey)

  val profileJobsJobCatagoryKeyFkey: ForeignKey[JobCatagories] = createForeignKey(jobCatagoryKey, "job_catagory_key")

  val profileJobsMissionaryProfileKeyFkey: ForeignKey[MissionaryProfiles] = createForeignKey(missionaryProfileKey, "missionary_profile_key")

  addMetadata(jobCatagoryKey, ColumnMetadata.named("job_catagory_key").ofType(4).withSize(10).notNull())
  addMetadata(missionaryProfileKey, ColumnMetadata.named("missionary_profile_key").ofType(4).withSize(10).notNull())
  addMetadata(profileJobKey, ColumnMetadata.named("profile_job_key").ofType(4).withSize(10).notNull())
}

