package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QProfileJobsView extends QProfileJobsView("profileJobsView") {
  override def as(variable: String) = new QProfileJobsView(variable)

}

class QProfileJobsView(md: PathMetadata[_]) extends RelationalPathImpl[ProfileJobsView](md, "web", "profile_jobs_view") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

  val jobCatagoryKey = createNumber[Int]("jobCatagoryKey")

  val missionaryProfileKey = createNumber[Int]("missionaryProfileKey")

  val profileJobKey = createNumber[Int]("profileJobKey")

  addMetadata(jobCatagoryKey, ColumnMetadata.named("job_catagory_key").ofType(4).withSize(10))
  addMetadata(missionaryProfileKey, ColumnMetadata.named("missionary_profile_key").ofType(4).withSize(10))
  addMetadata(profileJobKey, ColumnMetadata.named("profile_job_key").ofType(4).withSize(10))
}

